let currentProjectPath = '';
let currentEnvData = { etc: {}, share: {}, allVariables: [], loadingOrder: [] };
let isModified = false;
let selectedScopes = new Set(); // Track which scopes are selected for filtering
let systemInfo = { os: null, hostname: null, username: null }; // System info for scope filtering
let resortTimer = null; // Timer for delayed resort
let pendingResort = false; // Flag to indicate a resort is pending


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
const addVariableBtn = document.getElementById('add-variable-btn');
const searchInput = document.getElementById('search-input');
const projectPathElement = document.getElementById('project-path');
const variablesTbody = document.getElementById('variables-tbody');
const modifiedIndicator = document.getElementById('modified-indicator');

// Preview elements
const previewKey = document.getElementById('preview-key');
const previewScope = document.getElementById('preview-scope');
const previewRaw = document.getElementById('preview-raw');
const previewEvaluated = document.getElementById('preview-evaluated');
const previewOS = document.getElementById('preview-os');
const previewHostname = document.getElementById('preview-hostname');
const previewUsername = document.getElementById('preview-username');

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
const confirmAddScope = document.getElementById('confirm-add-scope');
const cancelAddScope = document.getElementById('cancel-add-scope');

const scopeManagerModal = document.getElementById('scope-manager-modal');
const modalLoadingOrderList = document.getElementById('modal-loading-order-list');
const addScopeFromManager = document.getElementById('add-scope-from-manager');
const confirmScopeManager = document.getElementById('confirm-scope-manager');
const cancelScopeManager = document.getElementById('cancel-scope-manager');

const modalClose = document.querySelectorAll('.modal-close');

let currentVariableForScopeChange = null; // Will store {key, scope, scopeType} to identify the variable

// Event listeners - route through menu events for consistency
openProjectBtn.addEventListener('click', () => {
  console.log('Open Project button clicked - routing through menu event');
  // Send message to main process to trigger menu action
  window.electronAPI.sendMenuAction('menu-open-project');
});

addVariableBtn.addEventListener('click', () => {
  console.log('Add Variable button clicked - routing through menu event');
  window.electronAPI.sendMenuAction('menu-add-variable');
});

searchInput.addEventListener('input', () => {
  // Reset resort timer on user activity
  if (resortTimer) {
    clearTimeout(resortTimer);
    if (pendingResort) {
      resortTimer = setTimeout(() => {
        renderVariables(false);
        pendingResort = false;
      }, 3000);
    }
  }
  renderVariables(pendingResort);
});

// Modal event listeners
confirmAddVariable.addEventListener('click', addVariable);
cancelAddVariable.addEventListener('click', hideAddVariableModal);
confirmAddScope.addEventListener('click', addScope);
cancelAddScope.addEventListener('click', hideAddScopeModal);
addScopeFromManager.addEventListener('click', () => {
  showAddScopeModal(true); // Pass flag to indicate we're in scope manager
});

confirmScopeManager.addEventListener('click', () => {
  // Apply pending scope selection if any
  if (window.pendingScopeSelection && currentVariableForScopeChange !== null) {
    changeVariableScopeByIdentity(currentVariableForScopeChange, window.pendingScopeSelection.scope, window.pendingScopeSelection.type);
  } else {
    hideScopeManagerModal();
  }
  window.pendingScopeSelection = null;
});

cancelScopeManager.addEventListener('click', () => {
  window.pendingScopeSelection = null;
  hideScopeManagerModal();
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

scopeNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addScope();
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
  console.log('Menu event: Toggle Filter - focus search');
  searchInput.focus();
});

window.electronAPI.onOpenRecentProject((event, projectPath) => {
  console.log('Menu event: Open Recent Project', projectPath);
  openProject(projectPath);
});

// Preview control event listeners
previewOS.addEventListener('change', () => {
  // Re-evaluate the current variable when preview settings change
  const selectedRow = variablesTbody.querySelector('tr.selected');
  if (selectedRow) {
    const index = Array.from(variablesTbody.querySelectorAll('tr')).indexOf(selectedRow);
    selectVariable(index);
  }
});

previewHostname.addEventListener('input', debounce(() => {
  const selectedRow = variablesTbody.querySelector('tr.selected');
  if (selectedRow) {
    const index = Array.from(variablesTbody.querySelectorAll('tr')).indexOf(selectedRow);
    selectVariable(index);
  }
}, 500));

previewUsername.addEventListener('input', debounce(() => {
  const selectedRow = variablesTbody.querySelector('tr.selected');
  if (selectedRow) {
    const index = Array.from(variablesTbody.querySelectorAll('tr')).indexOf(selectedRow);
    selectVariable(index);
  }
}, 500));

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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
    
    // Set defaults in preview controls
    if (previewHostname) {
      previewHostname.placeholder = systemInfo.hostname || 'Current hostname';
    }
    if (previewUsername) {
      previewUsername.placeholder = systemInfo.username || 'Current username';
    }
    
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
      
      // Add hardcoded system scope variables at priority 0
      addSystemScopeVariables();

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

function addSystemScopeVariables() {
  // Create hardcoded system scope at priority 0 (highest priority)
  const systemVariables = [
    {
      key: 'MULLE_HOSTNAME',
      value: systemInfo.hostname || '',
      scope: 'system',
      scopeType: 'system',
      priority: 0,
      editable: false,
      enabled: true,
      comment: 'System hostname'
    },
    {
      key: 'MULLE_USERNAME',
      value: systemInfo.username || '',
      scope: 'system',
      scopeType: 'system',
      priority: 0,
      editable: false,
      enabled: true,
      comment: 'System username'
    },
    {
      key: 'MULLE_UNAME',
      value: systemInfo.os || '',
      scope: 'system',
      scopeType: 'system',
      priority: 0,
      editable: false,
      enabled: true,
      comment: 'System OS'
    },
    {
      key: 'MULLE_VIRTUAL_ROOT',
      value: currentProjectPath || '',
      scope: 'system',
      scopeType: 'system',
      priority: 0,
      editable: false,
      enabled: true,
      comment: 'Project path'
    },
    {
      key: 'MULLE_VIRTUAL_ROOT_ID',
      value: '11118481111',
      scope: 'system',
      scopeType: 'system',
      priority: 0,
      editable: false,
      enabled: true,
      comment: 'Virtual root ID'
    }
  ];
  
  // Prepend system variables to the unified list
  currentEnvData.allVariables = [...systemVariables, ...currentEnvData.allVariables];
  
  // Add system scope to loading order at the beginning
  currentEnvData.loadingOrder.unshift({
    type: 'system',
    scope: 'system',
    priority: 0
  });
}

function showEditorScreen() {
  welcomeScreen.classList.remove('active');
  editorScreen.classList.add('active');
}



function renderVariables(skipSort = false) {
  variablesTbody.innerHTML = '';

  let variablesToShow = currentEnvData.allVariables;

  // Apply search filter
  const searchTerm = searchInput.value.trim().toLowerCase();
  if (searchTerm) {
    variablesToShow = variablesToShow.filter(variable => 
      variable.key.toLowerCase().includes(searchTerm)
    );
  }

  // Apply scope filter if any scopes are selected
  if (selectedScopes.size > 0) {
    variablesToShow = variablesToShow.filter(variable => {
      const scopeKey = `${variable.scopeType}:${variable.scope}`;
      return selectedScopes.has(scopeKey);
    });
  }

  // Sort by priority first (ascending), then by key name (unless skipSort is true)
  if (!skipSort) {
    variablesToShow.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.key.localeCompare(b.key);
    });
  }

  variablesToShow.forEach((variable, renderedIndex) => {
    // Find the actual index in the full allVariables array
    const actualIndex = currentEnvData.allVariables.findIndex(v => 
      v.key === variable.key && v.scope === variable.scope && v.scopeType === variable.scopeType
    );
    
    const tr = document.createElement('tr');
    const hasUnsafeValue = checkForUnsafeCommands(variable.value);
    const isApplicable = isScopeApplicable(variable.scope);
    
    tr.className = variable.editable ? '' : 'read-only';
    if (hasUnsafeValue) {
      tr.classList.add('unsafe-value');
    }
    if (!isApplicable) {
      tr.classList.add('inactive-scope');
    }
    tr.style.cursor = 'pointer';
    tr.onclick = (e) => {
      // Only prevent selection when clicking directly on buttons
      if (e.target.tagName === 'BUTTON') {
        return;
      }
      selectVariable(actualIndex);
    };
    
    tr.innerHTML = `
      <td class="var-key">
        <input type="text" value="${escapeHtml(variable.key)}"
               ${variable.editable ? '' : 'readonly'}
               onchange="updateVariable(${actualIndex}, 'key', this.value)"
               onfocus="selectVariable(${actualIndex})">
      </td>
      <td class="var-scope">
        <div class="scope-cell">
          <span class="scope-badge scope-${variable.scopeType}${!isApplicable ? ' inactive' : ''}" title="${variable.scopeType} scope${!isApplicable ? ' (inactive on this system)' : ''}">${variable.scope}</span>
          ${variable.editable ? 
            `<button class="scope-change-btn" onclick="event.stopPropagation(); showScopeManagerForVariable(${actualIndex})" title="Change scope">...</button>` : 
            ''
          }
        </div>
      </td>
      <td class="var-value">
        <input type="text" value="${escapeHtml(variable.value)}"
               ${variable.editable ? '' : 'readonly'}
               onchange="updateVariable(${actualIndex}, 'value', this.value)"
               onfocus="selectVariable(${actualIndex})"
               title="${hasUnsafeValue ? '⚠️ Contains command substitution' : ''}">
        ${hasUnsafeValue ? '<span class="unsafe-indicator" title="Contains command substitution (backticks or $())">⚠️</span>' : ''}
      </td>
      <td class="var-actions">
        ${variable.editable ?
          `<button class="btn btn-small btn-delete" onclick="event.stopPropagation(); removeVariable(${actualIndex})" title="Delete variable">DELETE</button>` :
          variable.scopeType === 'system' ? '' :
          `<button class="btn btn-small btn-copy" onclick="event.stopPropagation(); copyToGlobal(${actualIndex})" title="Copy to global scope">COPY</button>`
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
  // System scope is always applicable
  if (scopeName === 'system') {
    return true;
  }
  
  const lowerScope = scopeName.toLowerCase();
  
  // Match os-<uname> pattern (followed by - or end of string)
  const osMatch = lowerScope.match(/\bos-([a-z0-9]+)(?:-|$)/);
  if (osMatch && osMatch[1] !== systemInfo.os) {
    return false;
  }
  
  // Match host-<hostname> pattern (followed by - or end of string)
  const hostMatch = lowerScope.match(/\bhost-([a-z0-9_-]+?)(?:-(?!$)|$)/);
  if (hostMatch && hostMatch[1] !== systemInfo.hostname) {
    return false;
  }
  
  // Match user-<username> pattern (followed by - or end of string)
  const userMatch = lowerScope.match(/\buser-([a-z0-9_-]+?)(?:-(?!$)|$)/);
  if (userMatch && userMatch[1] !== systemInfo.username) {
    return false;
  }
  
  // Scope is applicable if all patterns match (or are not present)
  return true;
}

function showScopeManagerForVariable(variableIndex) {
  const variable = currentEnvData.allVariables[variableIndex];
  if (!variable) return;
  
  // Store variable identity, not index (index changes after rebuild)
  currentVariableForScopeChange = {
    key: variable.key,
    scope: variable.scope,
    scopeType: variable.scopeType
  };
  
  // Render loading order list (which is also the scope selector now)
  renderModalLoadingOrder();
  
  scopeManagerModal.classList.add('active');
}

function renderModalLoadingOrder() {
  modalLoadingOrderList.innerHTML = '';
  
  // Sort by priority (ascending - lower numbers first)
  const order = [...currentEnvData.loadingOrder].sort((a, b) => a.priority - b.priority);
  
  order.forEach((scopeInfo, index) => {
    const li = document.createElement('li');
    // Only NEW custom scopes added to auxscope can be deleted
    // Only etc scopes IN auxscope can be dragged (to reorder their priority)
    const isDeletable = scopeInfo.isCustomAuxscope === true && scopeInfo.type === 'etc';
    const isDraggable = scopeInfo.isInAuxscope === true && scopeInfo.type === 'etc';
    const isSystem = scopeInfo.scope === 'system';
    
    li.className = 'loading-order-item';
    li.dataset.scope = scopeInfo.scope;
    li.dataset.type = scopeInfo.type;
    li.dataset.builtin = scopeInfo.isBuiltin || false;
    li.dataset.priority = scopeInfo.priority;
    
    // Highlight: pending selection takes priority over current variable's scope
    if (window.pendingScopeSelection) {
      if (scopeInfo.scope === window.pendingScopeSelection.scope && scopeInfo.type === window.pendingScopeSelection.type) {
        li.classList.add('selected');
      }
    } else if (currentVariableForScopeChange !== null) {
      if (scopeInfo.scope === currentVariableForScopeChange.scope && scopeInfo.type === currentVariableForScopeChange.scopeType) {
        li.classList.add('selected');
      }
    }
    
    const scopeName = scopeInfo.scope.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const hasVars = (scopeInfo.type === 'etc' ? currentEnvData.etc[scopeInfo.scope] : currentEnvData.share[scopeInfo.scope])?.length > 0;
    
    li.innerHTML = `
      ${isDraggable ? '<span class="drag-handle">⋮⋮</span>' : (isSystem ? '<span class="builtin-indicator">⚙️</span>' : '<span class="builtin-indicator"></span>')}
      <span class="scope-name">${scopeName}</span>
      <span class="scope-type">${scopeInfo.type}</span>
      <span class="priority">${scopeInfo.priority}</span>
      <span class="var-indicator">${hasVars ? '●' : '○'}</span>
      ${isDeletable ? `<button class="btn-icon delete-scope" onclick="deleteScopeByName('${scopeInfo.scope}', '${scopeInfo.type}')" title="Remove from auxscope">🗑️</button>` : ''}
    `;
    
    if (isDraggable) {
      li.draggable = true;
      li.addEventListener('dragstart', handleModalDragStart);
      li.addEventListener('dragend', handleDragEnd);
    }
    
    // All items can be drop targets (except system)
    if (scopeInfo.scope !== 'system') {
      li.addEventListener('dragover', handleDragOver);
      li.addEventListener('drop', handleModalDrop);
    }
    
    // Make scope selectable when changing variable scope
    if (scopeInfo.type === 'etc' && scopeInfo.scope !== 'system' && currentVariableForScopeChange !== null) {
      li.addEventListener('click', (e) => {
        // Don't trigger if clicking delete button or drag handle
        if (e.target.classList.contains('delete-scope') || e.target.closest('.delete-scope') || 
            e.target.classList.contains('drag-handle')) {
          return;
        }
        // Just highlight the selection, don't close modal yet
        document.querySelectorAll('.loading-order-item').forEach(item => item.classList.remove('selected'));
        li.classList.add('selected');
        // Store the pending selection
        window.pendingScopeSelection = { scope: scopeInfo.scope, type: scopeInfo.type };
      });
      li.style.cursor = 'pointer';
    }
    
    modalLoadingOrderList.appendChild(li);
  });
}

function changeVariableScopeByIdentity(varIdentity, newScope, newScopeType) {
  // Find the variable by its identity (key + old scope + old scopeType)
  const oldSourceData = currentEnvData[varIdentity.scopeType][varIdentity.scope];
  if (!oldSourceData) return;
  
  const varIndex = oldSourceData.findIndex(v => v.name === varIdentity.key);
  if (varIndex < 0) return;
  
  // Check for duplicate in target scope
  if (!currentEnvData[newScopeType][newScope]) {
    currentEnvData[newScopeType][newScope] = [];
  }
  
  const duplicate = currentEnvData[newScopeType][newScope].find(v => v.name === varIdentity.key);
  if (duplicate) {
    showStatus(`Variable "${varIdentity.key}" already exists in ${newScope} scope`, 'error');
    return;
  }
  
  const varData = oldSourceData.splice(varIndex, 1)[0];
  currentEnvData[newScopeType][newScope].push(varData);
  
  // Rebuild unified variables with new scope
  rebuildUnifiedVariables();
  
  // Render without sorting to keep current selection visible
  renderVariables(true);
  
  // Find and select the row by variable name
  setTimeout(() => {
    const rows = variablesTbody.querySelectorAll('tr');
    rows.forEach(row => {
      const keyInput = row.querySelector('.var-key input');
      if (keyInput && keyInput.value === varIdentity.key) {
        row.classList.add('selected');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, 100);
  
  // Schedule delayed resort after 3 seconds of inactivity
  if (resortTimer) clearTimeout(resortTimer);
  pendingResort = true;
  
  const tryResort = () => {
    if (!document.activeElement || document.activeElement.tagName !== 'INPUT' || !document.activeElement.closest('#variables-tbody')) {
      renderVariables(false);
      pendingResort = false;
      resortTimer = null;
    } else {
      // Still editing, retry in 3 seconds
      resortTimer = setTimeout(tryResort, 3000);
    }
  };
  
  resortTimer = setTimeout(tryResort, 3000);
  
  hideScopeManagerModal();
  setModified(true);
  showStatus('Variable scope changed', 'success');
}

function changeVariableScope(variableIndex, newScope, newScopeType) {
  const variable = currentEnvData.allVariables[variableIndex];
  if (!variable || !variable.editable) return;
  
  changeVariableScopeByIdentity({
    key: variable.key,
    scope: variable.scope,
    scopeType: variable.scopeType
  }, newScope, newScopeType);
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

function handleDragEnd(e) {
  this.classList.remove('dragging');
  // Clear all drag-over indicators
  document.querySelectorAll('.loading-order-item').forEach(item => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  // Clear all previous drag-over indicators
  document.querySelectorAll('.loading-order-item').forEach(item => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  
  // Get the element we're hovering over
  const afterElement = getDragAfterElement(modalLoadingOrderList, e.clientY);
  
  if (afterElement) {
    // Show indicator above the element we'd insert before
    afterElement.classList.add('drag-over-top');
  } else {
    // We're at the end, show indicator below the last item
    const items = modalLoadingOrderList.querySelectorAll('.loading-order-item:not(.dragging)');
    if (items.length > 0) {
      items[items.length - 1].classList.add('drag-over-bottom');
    }
  }
  
  return false;
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.loading-order-item:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function handleModalDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  // Clear drag indicators
  document.querySelectorAll('.loading-order-item').forEach(item => {
    item.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  const draggedScope = draggedElement.dataset.scope;
  const draggedType = draggedElement.dataset.type;
  const dropTarget = e.currentTarget;
  const dropScope = dropTarget.dataset.scope;
  
  // Don't allow dropping on system scope
  if (dropScope === 'system') return false;
  
  // Find the dragged scope in loadingOrder
  const draggedScopeInfo = currentEnvData.loadingOrder.find(
    s => s.scope === draggedScope && s.type === draggedType
  );
  
  const dropScopeInfo = currentEnvData.loadingOrder.find(
    s => s.scope === dropScope && s.type === dropTarget.dataset.type
  );
  
  if (!draggedScopeInfo || !dropScopeInfo) return false;
  
  // Check if we're dropping above or below
  const rect = dropTarget.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const dropAbove = e.clientY < midpoint;
  
  // Get sorted scopes to find neighbors
  const sorted = [...currentEnvData.loadingOrder].sort((a, b) => a.priority - b.priority);
  const dropIndex = sorted.findIndex(s => s.scope === dropScope && s.type === dropTarget.dataset.type);
  
  if (dropAbove) {
    const prevPriority = dropIndex > 0 ? sorted[dropIndex - 1].priority : 0;
    const dropPriority = sorted[dropIndex].priority;
    draggedScopeInfo.priority = (prevPriority + dropPriority) / 2;
  } else {
    const dropPriority = sorted[dropIndex].priority;
    const nextPriority = dropIndex < sorted.length - 1 ? sorted[dropIndex + 1].priority : dropPriority + 100;
    draggedScopeInfo.priority = (dropPriority + nextPriority) / 2;
  }

  // Rebuild the unified variable list with new priority order
  rebuildUnifiedVariables();
  renderModalLoadingOrder();
  renderVariables();
  setModified(true);

  return false;
}

function handleDragEndOld(e) {
  this.classList.remove('dragging');
  draggedElement = null;
}

function rebuildUnifiedVariables() {
  // Rebuild the unified variable list based on priority order
  // Lower priority number = loaded first (highest precedence)
  const allVariables = [];
  const variableKeys = new Set();

  // Sort by priority ascending (lowest first)
  const sortedScopes = [...currentEnvData.loadingOrder].sort((a, b) => a.priority - b.priority);

  // Process in priority order - first loaded has highest precedence
  for (const scopeInfo of sortedScopes) {
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
  
  // Find the row that corresponds to this variable
  const rows = variablesTbody.querySelectorAll('tr');
  for (const row of rows) {
    const keyInput = row.querySelector('.var-key input');
    if (keyInput && keyInput.value === variable.key) {
      row.classList.add('selected');
      break;
    }
  }
  
  // Get preview context
  const previewContext = {
    os: previewOS.value || systemInfo.os,
    hostname: previewHostname.value.trim() || systemInfo.hostname,
    username: previewUsername.value.trim() || systemInfo.username
  };
  
  // Update preview
  previewKey.textContent = variable.key;
  previewScope.textContent = `[${variable.scopeType}:${variable.scope}, priority: ${variable.priority}]`;
  previewRaw.textContent = variable.value || '(empty)';
  
  // Check if this variable's scope matches the preview context
  if (!isScopeApplicableForPreview(variable.scope, previewContext)) {
    previewEvaluated.textContent = '(scope not applicable for selected platform/hostname/username)';
    previewEvaluated.style.fontStyle = 'italic';
    previewEvaluated.style.color = 'var(--text-secondary)';
    return;
  }
  
  // Evaluate the value
  previewEvaluated.style.fontStyle = 'normal';
  previewEvaluated.style.color = 'var(--text-primary)';
  previewEvaluated.textContent = 'Evaluating...';
  const evaluated = await evaluateValue(variable.value, index, previewContext);
  previewEvaluated.textContent = evaluated;
}

async function evaluateValue(value, currentIndex, previewContext) {
  if (!value) return '(empty)';
  
  // Build environment from all variables with higher priority (lower index)
  // Filter based on preview context (platform/hostname/username)
  const env = {};
  for (let i = 0; i < currentIndex; i++) {
    const v = currentEnvData.allVariables[i];
    if (v.enabled !== false && isScopeApplicableForPreview(v.scope, previewContext)) {
      // Override system variables with preview context values
      if (v.scopeType === 'system') {
        if (v.key === 'MULLE_HOSTNAME') {
          env[v.key] = previewContext.hostname;
        } else if (v.key === 'MULLE_USERNAME') {
          env[v.key] = previewContext.username;
        } else if (v.key === 'MULLE_UNAME') {
          env[v.key] = previewContext.os;
        } else {
          env[v.key] = v.value || '';
        }
      } else {
        env[v.key] = v.value || '';
      }
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

function isScopeApplicableForPreview(scopeName, context) {
  // System scope is always applicable
  if (scopeName === 'system') {
    return true;
  }
  
  const lowerScope = scopeName.toLowerCase();
  
  // Match os-<uname> pattern (followed by - or end of string)
  const osMatch = lowerScope.match(/\bos-([a-z0-9]+)(?:-|$)/);
  if (osMatch && osMatch[1] !== context.os) {
    return false;
  }
  
  // Match host-<hostname> pattern (followed by - or end of string)
  const hostMatch = lowerScope.match(/\bhost-([a-z0-9_-]+?)(?:-(?!$)|$)/);
  if (hostMatch && hostMatch[1] !== context.hostname) {
    return false;
  }
  
  // Match user-<username> pattern (followed by - or end of string)
  const userMatch = lowerScope.match(/\buser-([a-z0-9_-]+?)(?:-(?!$)|$)/);
  if (userMatch && userMatch[1] !== context.username) {
    return false;
  }
  
  // Scope is applicable if all patterns match (or are not present)
  return true;
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
  
  // Clear search filter to show the new variable
  searchInput.value = '';
  
  renderVariables();
  setModified(true);
  
  // Find the actual index in allVariables (not the rendered index)
  const actualIndex = currentEnvData.allVariables.findIndex(v => 
    v.key === placeholderName && v.scope === 'global' && v.scopeType === 'etc'
  );
  
  if (actualIndex >= 0) {
    // Scroll to and select the new row
    // Count how many variables appear before this one in the rendered list
    let renderedIndex = 0;
    for (let i = 0; i < actualIndex; i++) {
      const v = currentEnvData.allVariables[i];
      if (v.priority <= currentEnvData.allVariables[actualIndex].priority) {
        renderedIndex++;
      }
    }
    
    const rows = variablesTbody.querySelectorAll('tr');
    if (rows[renderedIndex]) {
      rows[renderedIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Focus on the key input for editing
      setTimeout(() => {
        const keyInput = rows[renderedIndex].querySelector('.var-key input');
        if (keyInput) {
          keyInput.focus();
          keyInput.select();
        }
      }, 300);
    }
  }
  
  showStatus('New variable added to global scope - enter name', 'success');
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
  // Show status in console instead
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✓' : 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Scope management functions
let isAddingScopeFromManager = false;

function showAddScopeModal(fromManager = false) {
  isAddingScopeFromManager = fromManager;
  if (fromManager) {
    scopeManagerModal.classList.remove('active');
  }
  addScopeModal.classList.add('active');
  scopeNameInput.focus();
}

function hideAddScopeModal() {
  addScopeModal.classList.remove('active');
  document.getElementById('add-scope-form').reset();
  if (isAddingScopeFromManager) {
    scopeManagerModal.classList.add('active');
    renderModalLoadingOrder();
    isAddingScopeFromManager = false;
  }
}

function addScope() {
  const name = scopeNameInput.value.trim();

  if (!name) {
    showStatus('Scope name is required', 'error');
    return;
  }

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    showStatus('Invalid scope name format - use only letters, numbers, and underscores', 'error');
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

  // Add the new scope with priority 50 (after global)
  const newScope = {
    scope: name,
    type: 'etc',
    priority: 50,
    isCustomAuxscope: true,
    isInAuxscope: true
  };

  currentEnvData.loadingOrder.push(newScope);

  // Initialize empty scope data
  currentEnvData.etc[name] = [];

  // Rebuild unified variables
  rebuildUnifiedVariables();

  // Re-render UI
  renderVariables();

  hideAddScopeModal();
  
  // If we're adding from scope manager, select this new scope and re-render modal
  if (currentVariableForScopeChange !== null) {
    window.pendingScopeSelection = { scope: name, type: 'etc' };
    renderModalLoadingOrder();
    scopeManagerModal.classList.add('active');
    
    // Scroll to the new scope
    setTimeout(() => {
      const newScopeItem = modalLoadingOrderList.querySelector(`[data-scope="${name}"]`);
      if (newScopeItem) {
        newScopeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }
  
  setModified(true);
  showStatus('Scope added successfully - drag to reorder', 'success');
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

function deleteScopeByName(scopeName, scopeType) {
  if (BUILTIN_SCOPES.has(scopeName)) {
    showStatus('Cannot delete built-in scope', 'error');
    return;
  }

  // Check if there are variables in this scope
  const scopeVariables = scopeType === 'etc' && currentEnvData.etc[scopeName] 
    ? currentEnvData.etc[scopeName] 
    : [];
  
  let confirmMessage = `Remove "${scopeName}" from auxscope?`;
  
  if (scopeVariables.length > 0) {
    const varNames = scopeVariables.map(v => v.name).join(', ');
    confirmMessage = `Remove "${scopeName}" from auxscope?\n\nWARNING: This scope has ${scopeVariables.length} variable(s): ${varNames}\n\nThese variables will be removed from the main screen and will no longer be loaded.`;
  }

  // Confirm deletion
  if (!confirm(confirmMessage)) {
    return;
  }

  // Find and remove from loading order (auxscope)
  const index = currentEnvData.loadingOrder.findIndex(
    s => s.scope === scopeName && s.type === scopeType
  );
  
  if (index >= 0) {
    currentEnvData.loadingOrder.splice(index, 1);
  }

  // Remove all variables from this scope in the unified list
  currentEnvData.allVariables = currentEnvData.allVariables.filter(
    v => !(v.scope === scopeName && v.scopeType === scopeType)
  );
  
  // Remove the scope data
  if (scopeType === 'etc' && currentEnvData.etc[scopeName]) {
    delete currentEnvData.etc[scopeName];
  }

  // Rebuild unified variables
  rebuildUnifiedVariables();

  // Re-render UI
  renderModalLoadingOrder();
  renderVariables();

  setModified(true);
  
  if (scopeVariables.length > 0) {
    showStatus(`Scope removed - ${scopeVariables.length} variable(s) deleted`, 'success');
  } else {
    showStatus('Scope removed from auxscope', 'success');
  }
}

// Initialize the app
init();