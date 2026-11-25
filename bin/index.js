#!/usr/bin/env node

const run = require('../lib/index.js');

run()
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
