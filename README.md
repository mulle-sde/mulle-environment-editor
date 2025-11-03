# Mulle Environment Editor

A visual editor for mulle-sde environment files, built with Electron.

## Features

- **Visual Environment Editing**: Edit environment variables in a clean, modern interface
- **Scope Management**: Manage different environment scopes (project, global, host-specific, user-specific, etc.)
- **Loading Order**: Drag-and-drop interface to reorder environment loading priority
- **Dual View Modes**: Switch between table view and text view for editing
- **Real-time Preview**: See how your environment variables will be applied
- **Recent Projects**: Quick access to recently opened projects
- **Cross-platform**: Works on Linux, macOS, and Windows

## Installation

### From Source

```bash
# Clone the repository
git clone <repository-url>
cd mulle-environment-editor

# Install dependencies
npm install

# Run the application
npm start
```

### Pre-built Binaries

Download the latest release for your platform from the [releases page](releases).

## Usage

1. **Open a Project**: Launch the application and click "Open Project" to select a directory containing a `.mulle` folder
2. **Select Environment Scope**: Choose from available scopes in the sidebar (project, global, host-specific, etc.)
3. **Edit Variables**:
   - Add new variables with the "Add Variable" button
   - Edit variable names, values, and comments inline
   - Toggle variable enablement with checkboxes
   - Remove variables with the delete button
4. **Reorder Loading Priority**: Drag and drop scopes in the loading order section
5. **Save Changes**: Click "Save" to write changes back to the environment files

## Environment File Structure

The editor works with mulle-sde's environment file structure:

```
.mulle/etc/env/           # Local environment files
├── environment-project.sh
├── environment-global.sh
├── environment-host-*.sh
├── environment-user-*.sh
├── environment-os-*.sh
└── auxscope              # Loading order configuration

.mulle/share/env/         # Shared environment files
├── environment-extension.sh
├── environment-plugin.sh
└── environment.sh
```

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for current platform
npm run build

# Build for specific platforms
npm run build-linux
npm run build-mac
npm run build-win
```

### Project Structure

```
mulle-environment-editor/
├── main.js          # Main Electron process
├── renderer.js      # Renderer process (UI logic)
├── preload.js       # Preload script (IPC bridge)
├── index.html       # Main UI layout
├── styles.css       # UI styling
└── package.json     # Dependencies and build config
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and feature requests, please use the [GitHub issue tracker](issues).