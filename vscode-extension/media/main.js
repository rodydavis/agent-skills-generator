const vscode = acquireVsCodeApi();

document.addEventListener('DOMContentLoaded', () => {
    const outputDirInput = document.getElementById('output-dir');
    const flatStructureInput = document.getElementById('flat-structure');
    const crawlDependenciesInput = document.getElementById('crawl-dependencies');
    const fileRenameInput = document.getElementById('file-rename');
    const rulesList = document.getElementById('rules-list');
    const addRuleBtn = document.getElementById('add-rule-btn');
    const crawlBtn = document.getElementById('crawl-btn');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');

    let rules = [];

    // Helper to render rules
    function renderRules() {
        rulesList.innerHTML = '';
        rules.forEach((rule, index) => {
            const ruleEl = document.createElement('div');
            ruleEl.className = 'rule-item';

            ruleEl.innerHTML = `
                <div class="rule-header">
                    <span>Rule #${index + 1}</span>
                    <div class="rule-actions">
                        <button class="icon-btn move-up-btn" data-index="${index}" title="Move Up" ${index === 0 ? 'disabled' : ''}>⬆️</button>
                        <button class="icon-btn move-down-btn" data-index="${index}" title="Move Down" ${index === rules.length - 1 ? 'disabled' : ''}>⬇️</button>
                        <button class="delete-btn" data-index="${index}" title="Delete">🗑</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>URL</label>
                    <input type="text" class="rule-url" data-index="${index}" value="${rule.url}" placeholder="https://example.com" />
                </div>
                <div class="form-group row">
                     <div class="checkbox-container">
                        <input type="checkbox" class="rule-subpaths" data-index="${index}" ${rule.subpaths ? 'checked' : ''} />
                        <label>Subpaths</label>
                     </div>
                     <div style="flex:1; margin-left: 10px;">
                        <select class="rule-action" data-index="${index}">
                            <option value="include" ${rule.action === 'include' ? 'selected' : ''}>Include</option>
                            <option value="ignore" ${rule.action === 'ignore' ? 'selected' : ''}>Ignore</option>
                        </select>
                     </div>
                </div>
            `;
            rulesList.appendChild(ruleEl);
        });

        // Add listeners for dynamic elements
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                rules.splice(index, 1);
                renderRules();
                updateButtonState();
                saveState();
            });
        });

        document.querySelectorAll('.move-up-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (index > 0) {
                    [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
                    renderRules();
                    saveState();
                }
            });
        });

        document.querySelectorAll('.move-down-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                if (index < rules.length - 1) {
                    [rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
                    renderRules();
                    saveState();
                }
            });
        });

        document.querySelectorAll('.rule-url').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                rules[index].url = e.target.value;
                saveState();
            });
        });

        document.querySelectorAll('.rule-subpaths').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                rules[index].subpaths = e.target.checked;
                saveState();
            });
        });

        document.querySelectorAll('.rule-action').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                rules[index].action = e.target.value;
                saveState();
            });
        });
    }

    function getState() {
        return {
            output: outputDirInput.value,
            flat: flatStructureInput.checked,
            crawlDependencies: crawlDependenciesInput.checked,
            file_rename: fileRenameInput.value,
            rules: rules
        };
    }

    function saveState() {
        const state = getState();
        vscode.postMessage({
            type: 'saveState',
            state: state
        });
    }

    // Input listeners for auto-save
    outputDirInput.addEventListener('change', saveState);
    flatStructureInput.addEventListener('change', saveState);
    crawlDependenciesInput.addEventListener('change', saveState);
    fileRenameInput.addEventListener('change', saveState);

    // Add Rule
    addRuleBtn.addEventListener('click', () => {
        rules.unshift({
            url: '',
            subpaths: true,
            action: 'include'
        });
        renderRules();
        updateButtonState();
        saveState();
    });

    // Run Crawl
    crawlBtn.addEventListener('click', () => {
        const config = getState();
        vscode.postMessage({
            type: 'runCrawl',
            config: config
        });
    });

    // Import/Export
    importBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'importConfig' });
    });

    exportBtn.addEventListener('click', () => {
        const state = getState();
        vscode.postMessage({ type: 'exportConfig', state: state });
    });

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'updateState':
                const state = message.state;
                if (state) {
                    outputDirInput.value = state.output || '.agents/skills';
                    flatStructureInput.checked = state.flat !== undefined ? state.flat : true;
                    if (crawlDependenciesInput) crawlDependenciesInput.checked = state.crawlDependencies || false;
                    fileRenameInput.value = state.file_rename || 'SKILL.md';
                    rules = state.rules || [];

                    // Update UI based on state
                    renderRules();
                    updateButtonState();

                    if (state.lastFetched) {
                        showUpdateOption(state.lastFetched);
                    }
                }
                break;
        }
    });

    function updateButtonState() {
        if (rules.length === 0) {
            crawlBtn.disabled = true;
            crawlBtn.style.opacity = '0.5';
            crawlBtn.style.cursor = 'not-allowed';
        } else {
            crawlBtn.disabled = false;
            crawlBtn.style.opacity = '1';
            crawlBtn.style.cursor = 'pointer';
        }
    }

    function showUpdateOption(date) {
        let updateBtn = document.getElementById('update-btn');
        if (!updateBtn) {
            const footer = document.querySelector('.footer-actions');
            updateBtn = document.createElement('button');
            updateBtn.id = 'update-btn';
            updateBtn.className = 'icon-btn';
            updateBtn.style.marginTop = '10px';
            updateBtn.style.width = '100%';
            updateBtn.textContent = `Check for Updates (Last: ${new Date(date).toLocaleDateString()})`;

            updateBtn.addEventListener('click', () => {
                const config = getState();
                vscode.postMessage({
                    type: 'runCrawl',
                    config: config
                });
            });

            // Insert after fetch button
            footer.insertAdjacentElement('afterend', updateBtn);
        } else {
            updateBtn.textContent = `Check for Updates (Last: ${new Date(date).toLocaleDateString()})`;
        }
    }

    // Initial render (maybe load defaults or empty)
    renderRules();

    // Call this initially
    updateButtonState();

    // Signal ready
    vscode.postMessage({ type: 'webviewReady' });
});
