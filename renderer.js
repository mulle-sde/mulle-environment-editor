let currentProjectPath = '';
let currentEnvData = { etc: {}, share: {}, allVariables: [], loadingOrder: [] };
let isModified = false;
let selectedScopes = new Set(); // Track which scopes are selected for filtering
let systemInfo = { os: null, hostname: null, username: null }; // System info for scope filtering


// Built-in scopes from include-environment.sh (these cannot be deleted or reordered)
const BUILTIN_SCOPES = new Set([
  'plugin',
  'plugin-os-darwin',
  'plugin-os-linux',
  'plugin-os-windows',
  'project',
  'global',
  'os-darwin',
  'os-linux',
  'os-windows',
  'host',
  'user',
  'user-os-darwin',
  'user-os-linux',
  'user-os-windows',
  'user-host',
  'custom',
  'post-global'
]);

// DOM elements
const welcomeScreen = document.getElementById('welcome-screen');
const editorScreen = document.getElementById('editor-screen');
const openProjectBtn = document.getElementById('open-project-btn');
const saveBtn = document.getElementById('save-btn');
const backBtn = document.getElementById('back-btn');
const addVariableBtn = document.getElementById('add-variable-btn');
const filterBtn = document.getElementById('filter-btn');
const projectPathElement = document.getElementById('project-path');
const variablesTbody = document.getElementById('variables-tbody');
const statusText = document.getElementById('status-text');
const modifiedIndicator = document.getElementById('modified-indicator');

// Preview elements
const previewKey = document.getElementById('preview-key');
const previewScope = document.getElementById('preview-scope');
const previewRaw = document.getElementById('preview-raw');
const previewEvaluated = document.getElementById('preview-evaluated');

// Modal elements
const addVariableModal = document.getElementById('add-variable-modal');
const varNameInput = document.getElementById('var-name');
const varValueInput = document.getElementById('var-value');
const varCommentInput = document.getElementById('var-comment');
const varEnabledInput = document.getElementById('var-enabled');
const confirmAddVariable = document.getElementById('confirm-add-variable');
const cancelAddVariable = document.getElementById('cancel-add-variable');

const addScopeModal = document.getElementById('add-scope-modal');
const scopeNameInput = document.getElementById('scope-name');
const scopeTypeInput = document.getElementById('scope-type');
const scopePriorityInput = document.getElementById('scope-priority');
const confirmAddScope = document.getElementById('confirm-add-scope');
const cancelAddScope = document.getElementById('cancel-add-scope');

const scopeManagerModal = document.getElementById('scope-manager-modal');
const scopeSelectorList = document.getElementById('scope-selector-list');
const modalLoadingOrderList = document.getElementById('modal-loading-order-list');
const addScopeFromManager = document.getElementById('add-scope-from-manager');

const modalClose = document.querySelectorAll('.modal-close');

let currentVariableForScopeChange = null;

// Event listeners - route through menu events for consistency
openProjectBtn.addEventListener('click', () => {
  console.log('Open Project button clicked - routing through menu event');
  // Send message to main process to trigger menu action
  window.electronAPI.sendMenuAction('menu-open-project');
});

backBtn.addEventListener('click', () => {
  console.log('Back button clicked - routing through menu event');
  window.electronAPI.sendMenuAction('menu-back');
});

addVariableBtn.addEventListener('click', () => {
  console.log('Add Variable button clicked - routing through menu event');
  window.electronAPI.sendMenuAction('menu-add-variable');
});

filterBtn.addEventListener('click', () => {
  console.log('Filter button clicked - routing through menu event');
  window.electronAPI.sendMenuAction('menu-toggle-filter');
});

// Modal event listeners
confirmAddVariable.addEventListener('click', addVariable);
cancelAddVariable.addEventListener('click', hideAddVariableModal);
confirmAddScope.addEventListener('click', addScope);
cancelAddScope.addEventListener('click', hideAddScopeModal);
addScopeFromManager.addEventListener('click', () => {
  hideScopeManagerModal();
  showAddScopeModal();
});

modalClose.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) {
      modal.classList.remove('active');
    }
  });
});

// Form submission
varNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addVariable();
  }
});

// Menu event listeners
window.electronAPI.onMenuOpenProject(() => {
  console.log('Menu event: Open Project');
  openProject();
});

window.electronAPI.onMenuSave(() => {
  console.log('Menu event: Save');
  saveEnvironment();
});

window.electronAPI.onMenuSaveAs(() => {
  console.log('Menu event: Save As');
  // TODO: Implement save as functionality
  showStatus('Save As not yet implemented', 'info');
});

window.electronAPI.onMenuBack(() => {
  console.log('Menu event: Back');
  showWelcomeScreen();
});

window.electronAPI.onMenuAddVariable(() => {
  console.log('Menu event: Add Variable');
  showAddVariableModal();
});

window.electronAPI.onMenuDeleteVariable(() => {
  console.log('Menu event: Delete Variable');
  // Delete the first selected variable or show status
  showStatus('Please select a variable to delete', 'info');
});

window.electronAPI.onMenuAddScope(() => {
  console.log('Menu event: Add Scope');
  showAddScopeModal();
});

window.electronAPI.onMenuToggleFilter(() => {
  console.log('Menu event: Toggle Filter');
  toggleScopeFilter();
});

window.electronAPI.onOpenRecentProject((event, projectPath) => {
  console.log('Menu event: Open Recent Project', projectPath);
  openProject(projectPath);
});

// Initialize
async function init() {
  await loadRecentProjects();
  await loadSystemInfo();
}

async function loadSystemInfo() {
  try {
    const os = await window.electronAPI.runMulleCommand('uname');
    const hostname = await window.electronAPI.runMulleCommand('hostname');
    const username = await window.electronAPI.runMulleCommand('username');
    
    systemInfo = {
      os: os?.trim().toLowerCase(),
      hostname: hostname?.trim().toLowerCase(),
      username: username?.trim().toLowerCase()
    };
    
    console.log('System info loaded:', systemInfo);
  } catch (error) {
    console.error('Failed to load system info:', error);
  }
}

async function loadRecentProjects() {
  try {
    const recentProjects = await window.electronAPI.getRecentProjects();
    const recentList = document.getElementById('recent-list');

    if (recentProjects.length === 0) {
      recentList.innerHTML = '<li class="text-muted">No recent projects</li>';
      return;
    }

    recentList.innerHTML = recentProjects.map(project =>
      `<li onclick="openRecentProject('${project}')">${project}</li>`
    ).join('');
  } catch (error) {
    console.error('Failed to load recent projects:', error);
  }
}

function openRecentProject(projectPath) {
  console.log('openRecentProject called with:', projectPath);
  // Direct call to openProject - recent projects work through the menu system already
  openProject(projectPath);
}

async function openProject(projectPath) {
  console.log('openProject called with:', projectPath);

  if (!projectPath) {
    try {
      console.log('No project path provided, opening dialog...');
      projectPath = await window.electronAPI.openProjectDialog();
      console.log('Dialog returned:', projectPath);
    } catch (error) {
      console.error('Failed to open project dialog:', error);
      showStatus('Failed to open project dialog', 'error');
      return;
    }
  }

  if (!projectPath) {
    console.log('No project path selected');
    return;
  }

  try {
    console.log('Loading environment files from:', projectPath);
    showStatus('Loading environment files...', 'info');
    const result = await window.electronAPI.readEnvironmentFiles(projectPath);
    console.log('Environment files result:', result);

    if (result.success) {
      currentProjectPath = projectPath;
      currentEnvData = result.data;

      projectPathElement.textContent = projectPath;
      showEditorScreen();
      renderVariables();
      
      // Check for unsafe values on load
      checkForUnsafeValuesOnLoad();
      
      showStatus('Environment files loaded successfully', 'success');
      console.log('Project loaded successfully');
    } else {
      console.error('Failed to load environment files:', result.error);
      showStatus(`Failed to load environment files: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Error loading project:', error);
    showStatus(`Error loading project: ${error.message}`, 'error');
  }
}

function showWelcomeScreen() {
  welcomeScreen.classList.add('active');
  editorScreen.classList.remove('active');
  isModified = false;
  updateModifiedIndicator();
}

function showEditorScreen() {
  welcomeScreen.classList.remove('active');
  editorScreen.classList.add('active');
}



function renderVariables() {
  variablesTbody.innerHTML = '';

  let variablesToShow = currentEnvData.allVariables;

  // Apply scope filter if any scopes are selected
  if (selectedScopes.size > 0) {
    variablesToShow = variablesToShow.filter(variable => {
      const scopeKey = `${variable.scopeType}:${variable.scope}`;
      return selectedScopes.has(scopeKey);
    });
  }

  // Sort by priority first (ascending), then by key name
  variablesToShow.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.key.localeCompare(b.key);
  });

  variablesToShow.forEach((variable, index) => {
    const tr = document.createElement('tr');
    const hasUnsafeValue = checkForUnsafeCommands(variable.value);
    tr.className = variable.editable ? '' : 'read-only';
    if (hasUnsafeValue) {
      tr.classList.add('unsafe-value');
    }
    tr.style.cursor = 'pointer';
    tr.onclick = (e) => {
      // Only prevent selection when clicking directly on buttons
      if (e.target.tagName === 'BUTTON') {
        return;
      }
      selectVariable(index);
    };

    const isApplicable = isScopeApplicable(variable.scope);
    
    tr.innerHTML = `
      <td class="var-key">
        <input type="text" value="${escapeHtml(variable.key)}"
               ${variable.editable ? '' : 'readonly'}
               onchange="updateVariable(${index}, 'key', this.value)"
               onfocus="selectVariable(${index})">
      </td>
      <td class="var-scope">
        <div class="scope-cell">
          <span class="scope-badge scope-${variable.scopeType}${!isApplicable ? ' inactive' : ''}" title="${variable.scopeType} scope${!isApplicable ? ' (inactive on this system)' : ''}">${variable.scope}</span>
          ${variable.editable ? 
            `<button class="scope-change-btn" onclick="event.stopPropagation(); showScopeManagerForVariable(${index})" title="Change scope">...</button>` : 
            ''
          }
        </div>
      </td>
      <td class="var-value">
        <input type="text" value="${escapeHtml(variable.value)}"
               ${variable.editable ? '' : 'readonly'}
               onchange="updateVariable(${index}, 'value', this.value)"
               onfocus="selectVariable(${index})"
               title="${hasUnsafeValue ? '⚠️ Contains command substitution' : ''}">
        ${hasUnsafeValue ? '<span class="unsafe-indicator" title="Contains command substitution (backticks or $())">⚠️</span>' : ''}
      </td>
      <td class="var-actions">
        ${variable.editable ?
          `<button class="btn btn-small btn-delete" onclick="event.stopPropagation(); removeVariable(${index})" title="Delete variable">DELETE</button>` :
          `<button class="btn btn-small btn-copy" onclick="event.stopPropagation(); copyToGlobal(${index})" title="Copy to global scope">COPY</button>`
        }
      </td>
    `;
    variablesTbody.appendChild(tr);
  });

  if (variablesToShow.length === 0) {
    variablesTbody.innerHTML = '<tr><td colspan="4" class="no-variables">No variables to display</td></tr>';
  }
}

function isScopeApplicable(scopeName) {
  // Check if scope matches current system
  const lowerScope = scopeName.toLowerCase();
  
  // OS-specific scopes
  if (lowerScope.includes('os-darwin') || lowerScope.includes('darwin')) {
    return systemInfo.os === 'darwin';
  }
  if (lowerScope.includes('os-linux') || lowerScope === 'linux') {
    return systemInfo.os === 'linux';
  }
  if (lowerScope.includes('os-windows') || lowerScope === 'windows') {
    return systemInfo.os === 'windows';
  }
  
  // Host-specific scopes
  if (lowerScope.includes('host') && !lowerScope.startsWith('host')) {
    // e.g., user-host-myhost
    return systemInfo.hostname && lowerScope.includes(systemInfo.hostname);
  }
  
  // User-specific scopes (but not just "user")
  if (lowerScope.includes('user-') || lowerScope.endsWith('-user')) {
    return systemInfo.username && lowerScope.includes(systemInfo.username);
  }
  
  // Generic scopes are always applicable
  return true;
}

function showScopeManagerForVariable(variableIndex) {
  currentVariableForScopeChange = variableIndex;
  const variable = currentEnvData.allVariables[variableIndex];
  
  // Render scope selector
  scopeSelectorList.innerHTML = '';
  
  for (const scopeInfo of currentEnvData.loadingOrder) {
    if (scopeInfo.type !== 'etc') continue; // Only show editable scopes
    
    const item = document.createElement('div');
    item.className = 'scope-selector-item';
    const isApplicable = isScopeApplicable(scopeInfo.scope);
    
    if (!isApplicable) {
      item.classList.add('inactive');
    }
    
    if (scopeInfo.scope === variable.scope && scopeInfo.type === variable.scopeType) {
      item.classList.add('selected');
    }
    
    const scopeName = scopeInfo.scope.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    item.innerHTML = `
      <div class="scope-info">
        <div class="scope-name">${scopeName}</div>
        <div class="scope-details">${scopeInfo.type} • priority: ${scopeInfo.priority}${!isApplicable ? ' • inactive on this system' : ''}</div>
      </div>
    `;
    
    item.addEventListener('click', () => {
      changeVariableScope(variableIndex, scopeInfo.scope, scopeInfo.type);
    });
    
    scopeSelectorList.appendChild(item);
  }
  
  // Render loading order list
  renderModalLoadingOrder();
  
  scopeManagerModal.classList.add('active');
}

function renderModalLoadingOrder() {
  modalLoadingOrderList.innerHTML = '';
  
  const order = currentEnvData.loadingOrder || [];
  
  order.forEach((scopeInfo, index) => {
    const li = document.createElement('li');
    const isBuiltin = BUILTIN_SCOPES.has(scopeInfo.scope);
    
    li.className = 'loading-order-item';
    li.dataset.index = index;
    li.dataset.builtin = isBuiltin;
    
    if (!isBuiltin) {
      li.draggable = true;
    }
    
    const scopeName = scopeInfo.scope.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const hasVars = (scopeInfo.type === 'etc' ? currentEnvData.etc[scopeInfo.scope] : currentEnvData.share[scopeInfo.scope])?.length > 0;
    
    li.innerHTML = `
      ${isBuiltin ? '<span class="builtin-indicator">⚙️</span>' : '<span class="drag-handle">⋮⋮</span>'}
      <span class="scope-name">${scopeName}</span>
      <span class="scope-type">${scopeInfo.type}</span>
      <span class="priority">${scopeInfo.priority}</span>
      <span class="var-indicator">${hasVars ? '●' : '○'}</span>
      ${!isBuiltin ? `<button class="btn-icon delete-scope" onclick="deleteScope(${index})" title="Delete custom scope">DELETE</button>` : ''}
    `;
    
    if (!isBuiltin) {
      li.addEventListener('dragstart', handleModalDragStart);
      li.addEventListener('dragover', handleDragOver);
      li.addEventListener('drop', handleModalDrop);
      li.addEventListener('dragend', handleDragEnd);
    }
    
    modalLoadingOrderList.appendChild(li);
  });
}

function changeVariableScope(variableIndex, newScope, newScopeType) {
  const variable = currentEnvData.allVariables[variableIndex];
  if (!variable || !variable.editable) return;
  
  const oldScope = variable.scope;
  const oldScopeType = variable.scopeType;
  
  // Remove from old scope
  const oldSourceData = currentEnvData[oldScopeType][oldScope];
  if (oldSourceData) {
    const varIndex = oldSourceData.findIndex(v => v.name === variable.key);
    if (varIndex >= 0) {
      const varData = oldSourceData.splice(varIndex, 1)[0];
      
      // Add to new scope
      if (!currentEnvData[newScopeType][newScope]) {
        currentEnvData[newScopeType][newScope] = [];
      }
      currentEnvData[newScopeType][newScope].push(varData);
    }
  }
  
  // Update variable
  variable.scope = newScope;
  variable.scopeType = newScopeType;
  
  // Update priority
  const scopeInfo = currentEnvData.loadingOrder.find(s => s.scope === newScope && s.type === newScopeType);
  if (scopeInfo) {
    variable.priority = scopeInfo.priority;
  }
  
  renderVariables();
  hideScopeManagerModal();
  setModified(true);
  showStatus('Variable scope changed', 'success');
}

function hideScopeManagerModal() {
  scopeManagerModal.classList.remove('active');
  currentVariableForScopeChange = null;
}

let draggedElement = null;

function handleModalDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleModalDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (draggedElement !== this) {
    const draggedIndex = parseInt(draggedElement.dataset.index);
    const targetIndex = parseInt(this.dataset.index);

    const item = currentEnvData.loadingOrder.splice(draggedIndex, 1)[0];
    currentEnvData.loadingOrder.splice(targetIndex, 0, item);

    // Rebuild the unified variable list with new priority order
    rebuildUnifiedVariables();
    renderModalLoadingOrder();
    renderVariables();
    setModified(true);
  }

  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  draggedElement = null;
}

function rebuildUnifiedVariables() {
  // Rebuild the unified variable list based on new priority order
  const allVariables = [];
  const variableKeys = new Set();

  // Process in priority order (lower priority first, so higher priority overrides)
  for (const scopeInfo of currentEnvData.loadingOrder) {
    const scopeData = scopeInfo.type === 'etc' ? currentEnvData.etc[scopeInfo.scope] : currentEnvData.share[scopeInfo.scope];
    if (scopeData) {
      for (const variable of scopeData) {
        if (!variableKeys.has(variable.name)) {
          variableKeys.add(variable.name);
          allVariables.push({
            key: variable.name,
            value: variable.value,
            scope: scopeInfo.scope,
            scopeType: scopeInfo.type,
            priority: scopeInfo.priority,
            editable: scopeInfo.type === 'etc',
            enabled: variable.enabled,
            comment: variable.comment
          });
        }
      }
    }
  }

  currentEnvData.allVariables = allVariables;
}

function updateVariable(index, field, value) {
  const variable = currentEnvData.allVariables[index];
  if (!variable || !variable.editable) return;

  const oldKey = variable.key;

  // If updating key, check for duplicates in the same scope
  if (field === 'key') {
    const trimmedValue = value.trim();
    
    // Check if key already exists in the same scope
    const duplicate = currentEnvData[variable.scopeType][variable.scope].find(
      v => v.name === trimmedValue && v.name !== oldKey
    );
    
    if (duplicate) {
      showStatus(`Variable "${trimmedValue}" already exists in ${variable.scope} scope`, 'error');
      // Revert the input value
      renderVariables();
      return;
    }
    
    value = trimmedValue;
  }

  // Security check for value field
  if (field === 'value') {
    if (checkForUnsafeCommands(value)) {
      showStatus('Warning: Value contains command substitution (backticks or $())', 'error');
      // Still allow the update but warn the user
    }
    
    // Reject values with quotes or backslashes - they break evaluation
    if (value.includes('"') || value.includes('\\')) {
      showStatus('Error: Values cannot contain double quotes or backslashes', 'error');
      renderVariables();
      return;
    }
  }

  // Update the variable in the original data structure
  variable[field] = value;

  // Update the source data
  const sourceData = currentEnvData[variable.scopeType][variable.scope];
  if (sourceData) {
    const sourceVar = sourceData.find(v => v.name === oldKey);
    if (sourceVar) {
      if (field === 'key') {
        sourceVar.name = value;
        variable.key = value; // Update the unified variable key too
      } else if (field === 'value') {
        sourceVar.value = value;
      }
    }
  }

  setModified(true);
}

function checkForUnsafeCommands(value) {
  if (!value) return false;
  return value.includes('`') || value.includes('$(');
}

function checkForUnsafeValuesOnLoad() {
  const unsafeVars = [];
  
  for (const variable of currentEnvData.allVariables) {
    if (checkForUnsafeCommands(variable.value)) {
      unsafeVars.push(`${variable.key} (${variable.scope})`);
    }
  }
  
  if (unsafeVars.length > 0) {
    const varList = unsafeVars.slice(0, 5).join(', ');
    const more = unsafeVars.length > 5 ? ` and ${unsafeVars.length - 5} more` : '';
    showStatus(`⚠️ Warning: ${unsafeVars.length} variable(s) contain command substitution: ${varList}${more}`, 'error');
  }
}

function removeVariable(index) {
  const variable = currentEnvData.allVariables[index];
  if (!variable || !variable.editable) return;

  // Remove from source data
  const sourceData = currentEnvData[variable.scopeType][variable.scope];
  if (sourceData) {
    const varIndex = sourceData.findIndex(v => v.name === variable.key);
    if (varIndex >= 0) {
      sourceData.splice(varIndex, 1);
    }
  }

  // Remove from unified list
  currentEnvData.allVariables.splice(index, 1);

  renderVariables();
  setModified(true);
}

async function selectVariable(index) {
  const variable = currentEnvData.allVariables[index];
  if (!variable) return;
  
  // Remove previous selection
  const previousSelected = variablesTbody.querySelector('tr.selected');
  if (previousSelected) {
    previousSelected.classList.remove('selected');
  }
  
  // Add selection to current row
  const rows = variablesTbody.querySelectorAll('tr');
  if (rows[index]) {
    rows[index].classList.add('selected');
  }
  
  // Update preview
  previewKey.textContent = variable.key;
  previewScope.textContent = `[${variable.scopeType}:${variable.scope}, priority: ${variable.priority}]`;
  previewRaw.textContent = variable.value || '(empty)';
  
  // Evaluate the value
  previewEvaluated.textContent = 'Evaluating...';
  const evaluated = await evaluateValue(variable.value, index);
  previewEvaluated.textContent = evaluated;
}

async function evaluateValue(value, currentIndex) {
  if (!value) return '(empty)';
  
  // Build environment from all variables with higher priority (lower index)
  const env = {};
  for (let i = 0; i < currentIndex; i++) {
    const v = currentEnvData.allVariables[i];
    if (v.enabled !== false) {
      env[v.key] = v.value || '';
    }
  }
  
  // Use bash to evaluate the value
  try {
    const evaluated = await window.electronAPI.evaluateValue(env, value);
    return evaluated;
  } catch (error) {
    console.error('Failed to evaluate value:', error);
    return `(evaluation error: ${error.message})`;
  }
}

function showAddVariableModal() {
  // Don't use modal, directly add variable inline
  addVariable();
}

function hideAddVariableModal() {
  addVariableModal.classList.remove('active');
  document.getElementById('add-variable-form').reset();
}

function addVariable() {
  // Create variable directly in global scope with placeholder name
  const placeholderName = 'KEY';
  
  // Check if global scope exists in etc
  if (!currentEnvData.etc['global']) {
    currentEnvData.etc['global'] = [];
    
    // Add global to loading order if not present
    const hasGlobal = currentEnvData.loadingOrder.some(s => s.scope === 'global' && s.type === 'etc');
    if (!hasGlobal) {
      currentEnvData.loadingOrder.push({
        type: 'etc',
        scope: 'global',
        priority: currentEnvData.loadingOrder.length
      });
    }
  }

  // Add variable to global scope with placeholder
  currentEnvData.etc['global'].push({
    name: placeholderName,
    value: '',
    enabled: true,
    comment: ''
  });

  // Rebuild unified variables
  rebuildUnifiedVariables();
  renderVariables();
  setModified(true);
  
  // Find the new variable in the rendered list and focus it
  const newIndex = currentEnvData.allVariables.findIndex(v => 
    v.key === placeholderName && v.scope === 'global' && v.scopeType === 'etc'
  );
  
  if (newIndex >= 0) {
    // Scroll to and select the new row
    const rows = variablesTbody.querySelectorAll('tr');
    if (rows[newIndex]) {
      rows[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Focus on the key input for editing
      setTimeout(() => {
        const keyInput = rows[newIndex].querySelector('.var-key input');
        if (keyInput) {
          keyInput.focus();
          keyInput.select();
        }
      }, 300);
    }
  }
  
  showStatus('New variable added to global scope - enter name', 'success');
}

function toggleScopeFilter() {
  // Toggle all scopes on/off
  if (selectedScopes.size > 0) {
    selectedScopes.clear();
  } else {
    // Select all scopes
    for (const scopeInfo of currentEnvData.loadingOrder) {
      const scopeKey = `${scopeInfo.type}:${scopeInfo.scope}`;
      selectedScopes.add(scopeKey);
    }
  }

  // Update UI
  document.querySelectorAll('.scope-item').forEach(item => {
    const itemScope = item.dataset.scope;
    const itemType = item.dataset.type;
    const itemKey = `${itemType}:${itemScope}`;

    if (selectedScopes.has(itemKey)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  renderVariables();
}

async function saveEnvironment() {
  if (!isModified) {
    showStatus('No changes to save', 'info');
    return;
  }

  try {
    showStatus('Saving environment files...', 'info');
    const result = await window.electronAPI.saveEnvironmentFiles(currentEnvData);

    if (result.success) {
      setModified(false);
      showStatus('Environment files saved successfully', 'success');
    } else {
      showStatus(`Failed to save: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error saving: ${error.message}`, 'error');
  }
}

function setModified(modified) {
  isModified = modified;
  updateModifiedIndicator();
}

function updateModifiedIndicator() {
  if (isModified) {
    modifiedIndicator.style.display = 'inline';
  } else {
    modifiedIndicator.style.display = 'none';
  }
}

function showStatus(message, type = 'info') {
  statusText.textContent = message;
  statusText.className = type;

  setTimeout(() => {
    statusText.textContent = 'Ready';
    statusText.className = '';
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Scope management functions
function showAddScopeModal() {
  addScopeModal.classList.add('active');
  scopeNameInput.focus();
}

function hideAddScopeModal() {
  addScopeModal.classList.remove('active');
  document.getElementById('add-scope-form').reset();
}

function addScope() {
  const name = scopeNameInput.value.trim();
  const type = scopeTypeInput.value;
  const priority = parseInt(scopePriorityInput.value);

  if (!name) {
    showStatus('Scope name is required', 'error');
    return;
  }

  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
    showStatus('Invalid scope name format', 'error');
    return;
  }

  if (BUILTIN_SCOPES.has(name)) {
    showStatus('Cannot add built-in scope', 'error');
    return;
  }

  // Check if scope already exists
  const existingScope = currentEnvData.loadingOrder.find(s => s.scope === name);
  if (existingScope) {
    showStatus('Scope already exists', 'error');
    return;
  }

  // Add the new scope
  const newScope = {
    scope: name,
    type: type,
    priority: priority
  };

  currentEnvData.loadingOrder.push(newScope);

  // Initialize empty scope data
  if (type === 'etc') {
    currentEnvData.etc[name] = [];
  } else {
    currentEnvData.share[name] = [];
  }

  // Rebuild unified variables
  rebuildUnifiedVariables();

  // Re-render UI
  renderVariables();

  hideAddScopeModal();
  setModified(true);
  showStatus('Scope added successfully', 'success');
}

function copyToGlobal(variableIndex) {
  const variable = currentEnvData.allVariables[variableIndex];
  if (!variable) return;
  
  // Check if global scope exists in etc
  if (!currentEnvData.etc['global']) {
    currentEnvData.etc['global'] = [];
    
    // Add global to loading order if not present
    const hasGlobal = currentEnvData.loadingOrder.some(s => s.scope === 'global' && s.type === 'etc');
    if (!hasGlobal) {
      currentEnvData.loadingOrder.push({
        type: 'etc',
        scope: 'global',
        priority: currentEnvData.loadingOrder.length
      });
    }
  }
  
  // Add variable to global scope with original key as starting point
  currentEnvData.etc['global'].push({
    name: variable.key,
    value: variable.value,
    enabled: variable.enabled,
    comment: variable.comment || ''
  });
  
  // Rebuild unified variables to reflect the new addition
  rebuildUnifiedVariables();
  renderVariables();
  setModified(true);
  
  // Find the new variable in the rendered list and focus it
  const newIndex = currentEnvData.allVariables.findIndex(v => 
    v.key === variable.key && v.scope === 'global' && v.scopeType === 'etc'
  );
  
  if (newIndex >= 0) {
    // Scroll to and select the new row
    const rows = variablesTbody.querySelectorAll('tr');
    if (rows[newIndex]) {
      rows[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Focus on the key input for editing
      setTimeout(() => {
        const keyInput = rows[newIndex].querySelector('.var-key input');
        if (keyInput) {
          keyInput.focus();
          keyInput.select();
        }
      }, 300);
    }
  }
  
  showStatus(`Copied "${variable.key}" to global scope - edit name if needed`, 'success');
}

function deleteScope(index) {
  const scopeInfo = currentEnvData.loadingOrder[index];
  if (!scopeInfo || BUILTIN_SCOPES.has(scopeInfo.scope)) {
    showStatus('Cannot delete built-in scope', 'error');
    return;
  }

  // Confirm deletion
  if (!confirm(`Delete custom scope "${scopeInfo.scope}"? This will remove all variables in this scope.`)) {
    return;
  }

  // Remove from loading order
  currentEnvData.loadingOrder.splice(index, 1);

  // Remove scope data
  delete currentEnvData[scopeInfo.type][scopeInfo.scope];

  // Rebuild unified variables
  rebuildUnifiedVariables();

  // Re-render UI
  renderVariables();

  setModified(true);
  showStatus('Scope deleted successfully', 'success');
}

// Initialize the app
init();