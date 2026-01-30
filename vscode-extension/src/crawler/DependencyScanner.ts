import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface FileSystem {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: string): string;
}

export interface Rule {
    url: string;
    subpaths?: boolean;
    action: 'include' | 'ignore';
    bundle?: boolean;
}

export class DependencyScanner {

    public static async scan(rootPath: string, fileSystem?: FileSystem): Promise<Rule[]> {
        const fsImpl = fileSystem || {
            existsSync: (p: string) => fs.existsSync(p),
            readFileSync: (p: string, encoding: string) => fs.readFileSync(p, encoding as BufferEncoding)
        };
        const rules: Rule[] = [];

        // NPM
        try {
            const pkgJsonPath = path.join(rootPath, 'package.json');
            if (fsImpl.existsSync(pkgJsonPath)) {
                const content = fsImpl.readFileSync(pkgJsonPath, 'utf8');
                const pkg = JSON.parse(content);
                const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };

                for (const [name, version] of Object.entries(deps)) {
                    const saneVersion = this.cleanVersion(version as string);
                    if (saneVersion) {
                        rules.push({
                            url: `https://www.npmjs.com/package/${name}/v/${saneVersion}`,
                            subpaths: true,
                            action: 'include'
                        });
                    }
                }
            }
        } catch (e) { console.error('Error scanning package.json', e); }

        // Pub
        try {
            const pubspecPath = path.join(rootPath, 'pubspec.yaml');
            if (fsImpl.existsSync(pubspecPath)) {
                const content = fsImpl.readFileSync(pubspecPath, 'utf8');
                const pub = yaml.load(content) as any;
                const deps = { ...pub.dependencies, ...pub.dev_dependencies };

                for (const [name, version] of Object.entries(deps)) {
                    if (name === 'flutter' || name === 'flutter_test') continue; // Skip SDK
                    if (typeof version === 'string') {
                        const saneVersion = this.cleanVersion(version);
                        if (saneVersion) {
                            rules.push({
                                url: `https://pub.dev/packages/${name}/versions/${saneVersion}`,
                                subpaths: true,
                                action: 'include',
                                bundle: true
                            });
                        }
                    } else if (typeof version === 'object' && version !== null) {
                        // Handle complex version constraints (path, git) - usually we skip path/git for now
                        // If it has a hosted source or just version key
                        const v = (version as any).version;
                        if (v) {
                            const saneVersion = this.cleanVersion(v);
                            if (saneVersion) {
                                rules.push({
                                    url: `https://pub.dev/packages/${name}/versions/${saneVersion}`,
                                    subpaths: true,
                                    action: 'include',
                                    bundle: true
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error('Error scanning pubspec.yaml', e); }

        // Go
        try {
            const goModPath = path.join(rootPath, 'go.mod');
            if (fsImpl.existsSync(goModPath)) {
                const content = fsImpl.readFileSync(goModPath, 'utf8');
                const lines = content.split('\n');
                let inRequire = false;

                for (const line of lines) {
                    const trim = line.trim();
                    if (trim.startsWith('require (') || trim === 'require (') {
                        inRequire = true;
                        continue;
                    }
                    if (inRequire && trim === ')') {
                        inRequire = false;
                        continue;
                    }

                    if (trim.startsWith('require ')) {
                        // One-liner: require example.com/mod v1.0.0
                        const parts = trim.split(/\s+/);
                        if (parts.length >= 3) {
                            this.addGoRule(rules, parts[1], parts[2]);
                        }
                    } else if (inRequire) {
                        // Block: example.com/mod v1.0.0
                        const parts = trim.split(/\s+/);
                        if (parts.length >= 2) {
                            this.addGoRule(rules, parts[0], parts[1]);
                        }
                    }
                }
            }
        } catch (e) { console.error('Error scanning go.mod', e); }

        return rules;
    }

    private static addGoRule(rules: Rule[], module: string, version: string) {
        // Ignore indirect? maybe not.
        // clean version
        const cleanV = this.cleanVersion(version);
        if (cleanV) {
            rules.push({
                url: `https://pkg.go.dev/${module}@${cleanV}`,
                subpaths: true,
                action: 'include'
            });
        }
    }

    private static cleanVersion(version: string): string | null {
        if (!version) return 'latest';

        // Remove ^, ~, >=, <=, etc
        let v = version.replace(/[\^~>=<]/g, '');
        v = v.trim();

        // Handle path/git?
        if (v.includes('/') || v.includes('git')) return null;

        return v;
    }
}
