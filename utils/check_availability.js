#!/usr/bin/env node
/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const Downloader = require('../lib/Downloader');
const https = require('https');
const OMAHA_PROXY = 'https://omahaproxy.appspot.com/all.json';

const downloader = Downloader.createDefault();

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m'
};

class Table {
  /**
     * @param {!Array<number>} columnWidths
     */
  constructor(columnWidths) {
    this.widths = columnWidths;
  }

  /**
     * @param {!Array<string>} values
     */
  drawRow(values) {
    console.assert(values.length === this.widths.length);
    let row = '';
    for (let i = 0; i < values.length; ++i)
      row += padCenter(values[i], this.widths[i]);
    console.log(row);
  }
}

if (process.argv.length === 2) {
  checkOmahaProxyAvailability();
  return;
}
if (process.argv.length !== 4) {
  console.log(`
  Usage: node check_revisions.js [fromRevision] [toRevision]

This script checks availability of different prebuild chromium revisions.
Running command without arguments will check against omahaproxy revisions.`);
  return;
}

const fromRevision = parseInt(process.argv[2], 10);
const toRevision = parseInt(process.argv[3], 10);
checkRangeAvailability(fromRevision, toRevision);

async function checkOmahaProxyAvailability() {
  console.log('Fetching revisions from ' + OMAHA_PROXY);
  const platforms = await loadJSON(OMAHA_PROXY);
  if (!platforms) {
    console.error('ERROR: failed to fetch chromium revisions from omahaproxy.');
    return;
  }
  const table = new Table([27, 7, 7, 7, 7]);
  table.drawRow([''].concat(downloader.supportedPlatforms()));
  for (const platform of platforms) {
    // Trust only to the main platforms.
    if (platform.os !== 'mac' && platform.os !== 'win' && platform.os !== 'win64' && platform.os !== 'linux')
      continue;
    const osName = platform.os === 'win' ? 'win32' : platform.os;
    for (const version of platform.versions) {
      if (version.channel !== 'dev' && version.channel !== 'beta' && version.channel !== 'canary' && version.channel !== 'stable')
        continue;
      const revisionName = padLeft('[' + osName + ' ' + version.channel + ']', 15);
      const revision = parseInt(version.branch_base_position, 10);
      await checkAndDrawRevisionAvailability(table, revisionName, revision);
    }
  }
}

/**
 * @param {number} fromRevision
 * @param {number} toRevision
 */
async function checkRangeAvailability(fromRevision, toRevision) {
  const table = new Table([10, 7, 7, 7, 7]);
  table.drawRow([''].concat(downloader.supportedPlatforms()));
  const inc = fromRevision < toRevision ? 1 : -1;
  for (let revision = fromRevision; revision !== toRevision; revision += inc)
    await checkAndDrawRevisionAvailability(table, '', revision);
}

/**
 * @param {!Table} table
 * @param {string} name
 * @param {number} revision
 */
async function checkAndDrawRevisionAvailability(table, name, revision) {
  const promises = [];
  for (const platform of downloader.supportedPlatforms())
    promises.push(downloader.canDownloadRevision(platform, revision));
  const availability = await Promise.all(promises);
  const allAvailable = availability.every(e => !!e);
  const values = [name + ' ' + (allAvailable ? colors.green + revision + colors.reset : revision)];
  for (let i = 0; i < availability.length; ++i) {
    const decoration = availability[i] ? '+' : '-';
    const color = availability[i] ? colors.green : colors.red;
    values.push(color + decoration + colors.reset);
  }
  table.drawRow(values);
}

/**
 * @param {string} url
 * @return {!Promise<?Object>}
 */
function loadJSON(url) {
  let resolve;
  const promise = new Promise(x => resolve = x);
  https.get(url, response => {
    if (response.statusCode !== 200) {
      resolve(null);
      return;
    }
    let body = '';
    response.on('data', function(chunk){
      body += chunk;
    });
    response.on('end', function(){
      const json = JSON.parse(body);
      resolve(json);
    });
  }).on('error', function(e){
    console.error('Error fetching json: ' + e);
    resolve(null);
  });
  return promise;
}

/**
 * @param {number} size
 * @return {string}
 */
function spaceString(size) {
  return new Array(size).fill(' ').join('');
}

/**
 * @param {string} text
 * @return {string}
 */
function filterOutColors(text) {
  for (const colorName in colors) {
    const color = colors[colorName];
    text = text.replace(color, '');
  }
  return text;
}

/**
 * @param {string} text
 * @param {number} length
 * @return {string}
 */
function padLeft(text, length) {
  const printableCharacters = filterOutColors(text);
  return printableCharacters.length >= length ? text : spaceString(length - text.length) + text;
}

/**
 * @param {string} text
 * @param {number} length
 * @return {string}
 */
function padCenter(text, length) {
  const printableCharacters = filterOutColors(text);
  if (printableCharacters.length >= length)
    return text;
  const left = Math.floor((length - printableCharacters.length) / 2);
  const right = Math.ceil((length - printableCharacters.length) / 2);
  return spaceString(left) + text + spaceString(right);
}
