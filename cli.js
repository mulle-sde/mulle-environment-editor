#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const electron = require('electron');
const appPath = path.join(__dirname, 'main.js');

spawn(electron, [appPath, '--no-sandbox'], {
  stdio: 'inherit'
});
