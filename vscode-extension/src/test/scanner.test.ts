
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as path from 'path';
import { DependencyScanner } from '../crawler/DependencyScanner';

describe('DependencyScanner', () => {
    const rootPath = '/test/root';

    it('should parse package.json dependencies', async () => {
        const mockFs = {
            existsSync: sinon.stub(),
            readFileSync: sinon.stub()
        };
        mockFs.existsSync.withArgs(path.join(rootPath, 'package.json')).returns(true);
        mockFs.readFileSync.withArgs(path.join(rootPath, 'package.json'), 'utf8').returns(JSON.stringify({
            dependencies: {
                'axios': '^1.0.0',
                'lodash': '4.17.21'
            }
        }));

        const rules = await DependencyScanner.scan(rootPath, mockFs);
        expect(rules).to.have.lengthOf(2);
        expect(rules[0].url).to.equal('https://www.npmjs.com/package/axios/v/1.0.0');
        expect(rules[1].url).to.equal('https://www.npmjs.com/package/lodash/v/4.17.21');
    });

    it('should parse pubspec.yaml dependencies', async () => {
        const mockFs = {
            existsSync: sinon.stub(),
            readFileSync: sinon.stub()
        };
        mockFs.existsSync.withArgs(path.join(rootPath, 'pubspec.yaml')).returns(true);
        mockFs.readFileSync.withArgs(path.join(rootPath, 'pubspec.yaml'), 'utf8').returns(`
dependencies:
  flutter:
    sdk: flutter
  http: ^1.1.0
  provider:
    version: ^6.0.0
`);

        const rules = await DependencyScanner.scan(rootPath, mockFs);
        // http and provider (flutter sdk skipped)
        expect(rules).to.have.lengthOf(2);

        const httpRule = rules.find(r => r.url.includes('http'));
        expect(httpRule?.url).to.equal('https://pub.dev/packages/http/versions/1.1.0');

        const providerRule = rules.find(r => r.url.includes('provider'));
        expect(providerRule?.url).to.equal('https://pub.dev/packages/provider/versions/6.0.0');
    });

    it('should parse go.mod dependencies', async () => {
        const mockFs = {
            existsSync: sinon.stub(),
            readFileSync: sinon.stub()
        };
        mockFs.existsSync.withArgs(path.join(rootPath, 'go.mod')).returns(true);
        mockFs.readFileSync.withArgs(path.join(rootPath, 'go.mod'), 'utf8').returns(`
module example.com/foo

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    golang.org/x/net v0.10.0 // indirect
)

require github.com/stretchr/testify v1.8.4
`);

        const rules = await DependencyScanner.scan(rootPath, mockFs);
        expect(rules).to.have.lengthOf(3);

        const ginRule = rules.find(r => r.url.includes('gin'));
        expect(ginRule?.url).to.equal('https://pkg.go.dev/github.com/gin-gonic/gin@v1.9.1');

        const netRule = rules.find(r => r.url.includes('net'));
        expect(netRule?.url).to.equal('https://pkg.go.dev/golang.org/x/net@v0.10.0');

        const testifyRule = rules.find(r => r.url.includes('testify'));
        expect(testifyRule?.url).to.equal('https://pkg.go.dev/github.com/stretchr/testify@v1.8.4');
    });
});
