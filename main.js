const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");

let mainWindow;
let currentProjectPath = "";

function createWindow() 
{
   let windowState = {
      width : 1200,
      height: 800,
      x     : undefined,
      y     : undefined
   };

   try 
   {
      const stateData = fsSync.readFileSync(
         path.join(app.getPath("userData"), "window-state.json"),
         "utf-8"
      );
      windowState = JSON.parse(stateData);
   }
   catch (_err) 
   {
   }

   mainWindow = new BrowserWindow({
      width         : windowState.width || 1200,
      height        : windowState.height || 800,
      x             : windowState.x,
      y             : windowState.y,
      title         : "Mulle Environment Editor",
      icon          : path.join(__dirname, "icon-512.png"),
      webPreferences: {
         preload         : path.join(__dirname, "preload.js"),
         contextIsolation: true,
         nodeIntegration : false
      },
      show: false
   });

   mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => 
   {
      const prefixes = ["[VERBOSE]", "[INFO]", "[WARN]", "[ERROR]"];
      const prefix = prefixes[level] ?? "[LOG]";
      const out = console[["log","log","warn","error"][level]] || console.log;
      out(`${prefix} [Renderer:${path.basename(sourceId)}:${line}] ${message}`);
   });

   if (windowState.maximized) 
   {
      mainWindow.maximize();
   }

   mainWindow.loadFile("index.html");

   mainWindow.once("ready-to-show", () => 
   {
      mainWindow.show();
   });

   mainWindow.on("close", () => 
   {
      saveWindowState(mainWindow);
   });

   mainWindow.on("closed", () => 
   {
      mainWindow = null;
   });

   createMenu();
}

async function updateRecentFilesMenu()
{
   const menu = Menu.getApplicationMenu();
   if (menu)
   {
      createMenu();
   }
}

function formatRecentPath(dirPath)
{
   const parts = dirPath.split(path.sep);
   if (parts.length >= 2)
   {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
   }
   return path.basename(dirPath);
}

async function createMenu() 
{
   let recentProjects = [];
   try
   {
      const recentsPath = path.join(app.getPath("userData"), "recent-projects.json");
      const data = await fs.readFile(recentsPath, "utf-8");
      recentProjects = JSON.parse(data);
   }
   catch (_err)
   {
   }

   const isMac = process.platform === "darwin";

   const recentProjectsSubmenu =
    recentProjects.length > 0
       ? recentProjects.map((projectPath) => ({
          label: formatRecentPath(projectPath),
          click: () => mainWindow.webContents.send("open-recent-project", projectPath),
       }))
       : [{
          label  : "No recent projects",
          enabled: false
       }];

   const template = [
      ...(isMac ? [{
         label  : app.name,
         submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" }
         ]
      }] : []),
      {
         label  : "File",
         submenu: [
            {
               label      : "Open Project",
               accelerator: "CmdOrCtrl+O",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-open-project");
               }
            },
            {
               label  : "Open Recent",
               submenu: recentProjectsSubmenu,
            },
            { type: "separator" },
            {
               label      : "Save",
               accelerator: "CmdOrCtrl+S",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-save");
               }
            },
            {
               label      : "Export as Shell Script...",
               accelerator: "CmdOrCtrl+E",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-export");
               }
            },
            { type: "separator" },
            {
               label      : "Close Project",
               accelerator: "Esc",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-back");
               }
            },
            { type: "separator" },
            isMac ? { role: "close" } : { role: "quit" }
         ]
      },
      {
         label  : "Edit",
         submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            ...(isMac ? [
               { role: "pasteAndMatchStyle" },
               { role: "delete" },
               { role: "selectAll" },
               { type: "separator" },
               {
                  label  : "Speech",
                  submenu: [
                     { role: "startSpeaking" },
                     { role: "stopSpeaking" }
                  ]
               }
            ] : [
               { role: "delete" },
               { type: "separator" },
               { role: "selectAll" }
            ]),
            { type: "separator" },
            {
               label      : "Settings...",
               accelerator: "CmdOrCtrl+,",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-settings");
               }
            }
            ...(isMac ? [
               { role: "pasteAndMatchStyle" },
               { role: "delete" },
               { role: "selectAll" },
               { type: "separator" },
               {
                  label  : "Speech",
                  submenu: [
                     { role: "startSpeaking" },
                     { role: "stopSpeaking" }
                  ]
               }
            ] : [
               { role: "delete" },
               { type: "separator" },
               { role: "selectAll" }
            ]),
            { type: "separator" },
            {
               label      : "Add Variable",
               accelerator: "CmdOrCtrl+N",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-add-variable");
               }
            },
            {
               label      : "Delete Variable",
               accelerator: "CmdOrCtrl+Backspace",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-delete-variable");
               }
            },
            { type: "separator" },
            {
               label      : "Add Scope",
               accelerator: "CmdOrCtrl+Shift+N",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-add-scope");
               }
            },
            {
               label      : "Toggle Scope Filter",
               accelerator: "CmdOrCtrl+F",
               click      : () => 
               {
                  mainWindow.webContents.send("menu-toggle-filter");
               }
            }
         ]
      },
      {
         label  : "View",
         submenu: [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { type: "separator" },
            { role: "togglefullscreen" }
         ]
      },
      {
         label  : "Window",
         submenu: [
            { role: "minimize" },
            { role: "zoom" },
            ...(isMac ? [
               { type: "separator" },
               { role: "front" },
               { type: "separator" },
               { role: "window" }
            ] : [
               { role: "close" }
            ])
         ]
      }
   ];

   const menu = Menu.buildFromTemplate(template);
   Menu.setApplicationMenu(menu);
}

function saveWindowState(window) 
{
   const bounds = window.getBounds();
   const state = {
      x        : bounds.x,
      y        : bounds.y,
      width    : bounds.width,
      height   : bounds.height,
      maximized: window.isMaximized()
   };

   try 
   {
      fsSync.writeFileSync(path.join(app.getPath("userData"), "window-state.json"), JSON.stringify(state));
   }
   catch (error) 
   {
      console.error("Failed to save window state:", error);
   }
}

async function loadRecentProjects() 
{
   try 
   {
      const data = await fs.readFile(path.join(app.getPath("userData"), "recent-projects.json"), "utf8");
      return JSON.parse(data);
   }
   catch (error) 
   {
      return [];
   }
}

async function saveRecentProjects(projects) 
{
   try 
   {
      await fs.writeFile(path.join(app.getPath("userData"), "recent-projects.json"), JSON.stringify(projects));
   }
   catch (error) 
   {
      console.error("Failed to save recent projects:", error);
   }
}

async function addToRecentProjects(projectPath) 
{
   const recent = await loadRecentProjects();
   const updated = [projectPath, ...recent.filter(p => p !== projectPath)].slice(0, 10);
   await saveRecentProjects(updated);
   await updateRecentFilesMenu();
}

// IPC handlers
ipcMain.handle("open-project-dialog", async () => 
{
   const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title     : "Select Project Directory"
   });

   if (!result.canceled && result.filePaths.length > 0) 
   {
      const projectPath = result.filePaths[0];
      await addToRecentProjects(projectPath);
      return projectPath;
   }
   return null;
});

ipcMain.handle("save-as-dialog", async () => 
{
   const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title     : "Save Environment To Project Directory"
   });

   if (!result.canceled && result.filePaths.length > 0) 
   {
      return result.filePaths[0];
   }
   return null;
});

ipcMain.handle("export-script-dialog", async () => 
{
   const result = await dialog.showSaveDialog(mainWindow, {
      title      : "Export as Shell Script",
      defaultPath: "environment-export.sh",
      filters    : [
         {
            name      : "Shell Scripts",
            extensions: ["sh"] 
         },
         {
            name      : "All Files",
            extensions: ["*"] 
         }
      ]
   });

   if (!result.canceled && result.filePath) 
   {
      return result.filePath;
   }
   return null;
});

ipcMain.handle("export-shell-script", async (event, scriptContent, filePath) => 
{
   try 
   {
      await fs.writeFile(filePath, scriptContent, { mode: 0o755 });
      return { success: true };
   }
   catch (error) 
   {
      return {
         success: false,
         error  : error.message 
      };
   }
});

ipcMain.handle("get-recent-projects", async () => 
{
   return await loadRecentProjects();
});

ipcMain.handle("read-environment-files", async (event, projectPath) => 
{
   try 
   {
      currentProjectPath = projectPath;
      const envData = await readEnvironmentFiles(projectPath);
      return {
         success: true,
         data   : envData 
      };
   }
   catch (error) 
   {
      return {
         success: false,
         error  : error.message 
      };
   }
});

ipcMain.handle("save-environment-files", async (event, envData) => 
{
   try 
   {
      await saveEnvironmentFiles(currentProjectPath, envData);
      return { success: true };
   }
   catch (error) 
   {
      return {
         success: false,
         error  : error.message 
      };
   }
});

ipcMain.handle("save-environment-files-to", async (event, envData, projectPath) => 
{
   try 
   {
      await saveEnvironmentFiles(projectPath, envData);
      currentProjectPath = projectPath;
      await addToRecentProjects(projectPath);
      return {
         success: true,
         projectPath 
      };
   }
   catch (error) 
   {
      return {
         success: false,
         error  : error.message 
      };
   }
});

ipcMain.handle("run-mulle-command", async (event, command) => 
{
   const { execSync } = require("child_process");
   try 
   {
      let cmd;
      switch (command) 
      {
         case "uname":
            cmd = "mulle-env uname";
            break;
         case "hostname":
            cmd = "mulle-env hostname";
            break;
         case "username":
            cmd = "mulle-env username";
            break;
         default:
            throw new Error(`Unknown command: ${command}`);
      }
      const result = execSync(cmd, {
         encoding: "utf-8",
         cwd     : currentProjectPath || process.cwd() 
      });
      return result.trim();
   }
   catch (error) 
   {
      console.error(`Failed to run mulle-env ${command}:`, error);
      return null;
   }
});

ipcMain.handle("evaluate-value", async (event, env, value) => 
{
   const { execSync } = require("child_process");
  
   if (!value) 
   {
      return "(empty)";
   }
  
   // Security check: disallow command substitution
   if (value.includes("`") || value.includes("$(")) 
   {
      return "(evaluation blocked: command substitution not allowed)";
   }
  
   try 
   {
      // Build bash script that exports all environment variables
      let script = "#!/usr/bin/env bash\n";
    
      // Check for problematic characters that would break the script
      const checkValue = (v) => 
      {
         if (!v) 
         {
            return true;
         }
         // Reject values with unbalanced quotes or other shell-breaking chars
         if (v.includes('"') || v.includes("\\")) 
         {
            return false;
         }
         return true;
      };
    
      // Export all preceding variables - NO escaping at all
      for (const [key, val] of Object.entries(env)) 
      {
         if (!checkValue(val)) 
         {
            return `(evaluation blocked: variable ${key} contains quotes or backslashes)`;
         }
         script += `export ${key}="${val || ""}"\n`;
      }
    
      // Check the value to evaluate
      if (!checkValue(value)) 
      {
         return "(evaluation blocked: value contains quotes or backslashes)";
      }
    
      // Export the value to evaluate - NO escaping
      script += `export _EVAL_TARGET="${value}"\n`;
    
      // Use eval with single quotes to let bash do the expansion
      script += `eval 'printf "%s" "\${_EVAL_TARGET}"'\n`;
    
      // Log the complete script for debugging
      console.log("=== Bash evaluation script for value:", value);
      console.log(script);
      console.log("=== End of script");
    
      const result = execSync(script, { 
         encoding: "utf-8",
         shell   : "bash",
         cwd     : currentProjectPath || process.cwd()
      });
    
      console.log("=== Evaluation result:", result);
    
      return result;
   }
   catch (error) 
   {
      console.error("Failed to evaluate value:", error);
      throw error;
   }
});

ipcMain.handle("calculate-virtual-root-id", async (event, virtualRoot) => 
{
   const crypto = require("crypto");
   try 
   {
      const hash = crypto.createHash("sha256").update(virtualRoot + "\n").digest("hex");
      return hash.substring(1, 13);
   }
   catch (error) 
   {
      console.error("Failed to calculate virtual root ID:", error);
      return null;
   }
});

async function readEnvironmentFiles(projectPath) 
{
   const envData = {
      etc         : {},
      share       : {},
      allVariables: [], // Unified view of all variables
      loadingOrder: []
   };

   // Get system info for template expansion
   const mulleUname = process.platform === "darwin" ? "darwin" : "linux";
   const mulleHostname = require("os").hostname();
   const mulleUsername = require("os").userInfo().username;

   // Build hardcoded inclusion order from include-environment.sh
   const hardcodedScopes = [
      {
         scope   : "plugin",
         type    : "share",
         priority: 5 
      },
      {
         scope   : `plugin-os-${mulleUname}`,
         type    : "share",
         priority: 15 
      },
      {
         scope   : "project",
         type    : "etc",
         priority: 20 
      }, // auxscope default
      {
         scope   : "global",
         type    : "etc",
         priority: 40 
      },
      {
         scope   : `os-${mulleUname}`,
         type    : "etc",
         priority: 60 
      },
      {
         scope   : `host-${mulleHostname}`,
         type    : "etc",
         priority: 80 
      },
      {
         scope   : `user-${mulleUsername}`,
         type    : "etc",
         priority: 100 
      },
      {
         scope   : `user-${mulleUsername}-os-${mulleUname}`,
         type    : "etc",
         priority: 120 
      },
      {
         scope   : `user-${mulleUsername}-host-${mulleHostname}`,
         type    : "etc",
         priority: 140 
      },
      {
         scope   : "custom",
         type    : "etc",
         priority: 1000 
      },
      {
         scope   : "post-global",
         type    : "etc",
         priority: 2000 
      }
   ];

   // Read etc/env files
   const etcEnvPath = path.join(projectPath, ".mulle", "etc", "env");
   if (fsSync.existsSync(etcEnvPath)) 
   {
      const files = await fs.readdir(etcEnvPath);
      for (const file of files) 
      {
         if (file.startsWith("environment-") && file.endsWith(".sh")) 
         {
            const content = await fs.readFile(path.join(etcEnvPath, file), "utf8");
            const scope = file.replace("environment-", "").replace(".sh", "");
            envData.etc[scope] = parseEnvironmentFile(content);
         }
      }

      // Read auxscope for additional scopes
      const auxscopePath = path.join(etcEnvPath, "auxscope");
      if (fsSync.existsSync(auxscopePath)) 
      {
         const auxscopeContent = await fs.readFile(auxscopePath, "utf8");
         const auxScopes = parseAuxscope(auxscopeContent, "etc");
         // Add auxscopes to hardcoded scopes, overriding priority for existing scopes
         auxScopes.forEach(auxScope => 
         {
            const existingIndex = hardcodedScopes.findIndex(s => s.scope === auxScope.scope && s.type === auxScope.type);
            if (existingIndex >= 0) 
            {
               // Existing hardcoded scope - just override priority, NOT deletable but IS draggable
               hardcodedScopes[existingIndex].priority = auxScope.priority;
               hardcodedScopes[existingIndex].isInAuxscope = true;
            }
            else 
            {
               // New custom scope added by auxscope - IS deletable and draggable
               auxScope.isCustomAuxscope = true;
               auxScope.isInAuxscope = true;
               hardcodedScopes.push(auxScope);
            }
         });
      }
   }

   // Read share/env files
   const shareEnvPath = path.join(projectPath, ".mulle", "share", "env");
   if (fsSync.existsSync(shareEnvPath)) 
   {
      const files = await fs.readdir(shareEnvPath);
      for (const file of files) 
      {
         if (file.startsWith("environment-") && file.endsWith(".sh")) 
         {
            const content = await fs.readFile(path.join(shareEnvPath, file), "utf8");
            const scope = file.replace("environment-", "").replace(".sh", "");
            envData.share[scope] = parseEnvironmentFile(content);
         }
      }

      // Read share auxscope for additional scopes
      const shareAuxscopePath = path.join(shareEnvPath, "auxscope");
      if (fsSync.existsSync(shareAuxscopePath)) 
      {
         const shareAuxscopeContent = await fs.readFile(shareAuxscopePath, "utf8");
         const shareAuxScopes = parseAuxscope(shareAuxscopeContent, "share");
         shareAuxScopes.forEach(auxScope => 
         {
            const existingIndex = hardcodedScopes.findIndex(s => s.scope === auxScope.scope && s.type === auxScope.type);
            if (existingIndex >= 0) 
            {
               hardcodedScopes[existingIndex].priority = auxScope.priority;
            }
            else 
            {
               hardcodedScopes.push(auxScope);
            }
         });
      }
   }

   // Sort by priority and build unified variable list
   hardcodedScopes.sort((a, b) => a.priority - b.priority);
   envData.loadingOrder = hardcodedScopes;

   // Build unified variable list
   const allVariables = [];
   const variableKeys = new Set();

   // Process in priority order (lower priority first, so higher priority overrides)
   for (const scopeInfo of hardcodedScopes) 
   {
      const scopeData = scopeInfo.type === "etc" ? envData.etc[scopeInfo.scope] : envData.share[scopeInfo.scope];
      if (scopeData) 
      {
         for (const variable of scopeData) 
         {
            if (!variableKeys.has(variable.name)) 
            {
               variableKeys.add(variable.name);
               allVariables.push({
                  key      : variable.name,
                  value    : variable.value,
                  scope    : scopeInfo.scope,
                  scopeType: scopeInfo.type,
                  priority : scopeInfo.priority,
                  editable : scopeInfo.type === "etc", // etc scopes are editable, share scopes are read-only
                  enabled  : variable.enabled,
                  comment  : variable.comment
               });
            }
         }
      }
   }

   envData.allVariables = allVariables;
   return envData;
}

function parseEnvironmentFile(content) 
{
   const variables = [];
   const lines = content.split("\n");
   let currentComment = "";

   for (const line of lines) 
   {
      const trimmed = line.trim();

      // Handle comments
      if (trimmed.startsWith("#")) 
      {
         currentComment = trimmed.substring(1).trim();
         continue;
      }

      if (trimmed.startsWith("export ")) 
      {
         const match = trimmed.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
         if (match) 
         {
            const [, name, value] = match;
            variables.push({
               name,
               value  : value.replace(/^["']|["']$/g, ""), // Remove surrounding quotes
               enabled: true,
               comment: currentComment
            });
            currentComment = ""; // Reset comment after using it
         }
      }
   }

   return variables;
}

function parseAuxscope(content, type) 
{
   const scopes = [];
   const lines = content.split("\n");

   for (const line of lines) 
   {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) 
      {
         const [scope, priorityStr] = trimmed.split(";");
         if (scope) 
         {
            const priority = priorityStr ? parseInt(priorityStr) : 20;
            scopes.push({
               scope   : scope.trim(),
               type    : type,
               priority: priority
            });
         }
      }
   }

   return scopes;
}

async function saveEnvironmentFiles(projectPath, envData) 
{
   // Group variables by scope and type for saving
   const scopeVariables = {};

   // Only save editable variables (etc scopes)
   for (const variable of envData.allVariables) 
   {
      if (variable.editable) 
      {
         const scopeKey = `${variable.scopeType}:${variable.scope}`;
         if (!scopeVariables[scopeKey]) 
         {
            scopeVariables[scopeKey] = [];
         }
         scopeVariables[scopeKey].push({
            name   : variable.key,
            value  : variable.value,
            enabled: variable.enabled,
            comment: variable.comment
         });
      }
   }

   // Save etc/env files
   const etcEnvPath = path.join(projectPath, ".mulle", "etc", "env");
   await fs.mkdir(etcEnvPath, { recursive: true });

   for (const [scopeKey, variables] of Object.entries(scopeVariables)) 
   {
      const [type, scope] = scopeKey.split(":");
      if (type === "etc") 
      {
         const filePath = path.join(etcEnvPath, `environment-${scope}.sh`);
         const content = generateEnvironmentFile(variables);
         await fs.writeFile(filePath, content);
      }
   }

   // Save auxscope - save all etc scopes that are in auxscope (regardless of whether they have variables)
   const auxscopes = envData.loadingOrder
      .filter(s => s.type === "etc" && s.isInAuxscope)
      .map(s => `${s.scope};${s.priority}`)
      .join("\n");

   if (auxscopes) 
   {
      const auxscopePath = path.join(etcEnvPath, "auxscope");
      await fs.writeFile(auxscopePath, auxscopes + "\n");
   }
}

function generateEnvironmentFile(variables) 
{
   let content = "";

   for (const variable of variables) 
   {
      if (variable.enabled) 
      {
         if (variable.comment) 
         {
            content += `# ${variable.comment}\n`;
         }
         content += `export ${variable.name}="${variable.value}"\n\n`;
      }
   }

   return content;
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => 
{
   if (process.platform !== "darwin") 
   {
      app.quit();
   }
});

app.on("activate", () => 
{
   if (BrowserWindow.getAllWindows().length === 0) 
   {
      createWindow();
   }
});

// Handle menu actions from renderer
ipcMain.on("menu-action", (event, action) => 
{
   if (mainWindow) 
   {
      mainWindow.webContents.send(action);
   }
});