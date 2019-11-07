/*
    
*/

"use strict";

const fs = require('fs');

function JsonFile(path, data) {
    this.data = data || {};
    this.path = path;
    if (fs.existsSync(path)) {
        this.getValues();
    } else {
        this.setValues(this.data);
        console.log({resultText: `JsonFile ${this.path} initial values`});
    }
}

JsonFile.prototype.getValues = function () {
    const data = fs.readFileSync(this.path, 'utf8');
    this.data = JSON.parse(data);
    return this.data;
}

JsonFile.prototype.setValues = function (data) {
    const json = JSON.stringify(data);
    try {
        fs.writeFileSync(this.path, json, 'utf8');
        this.data = data;
        return {success: true, data};
    } catch (error) {
        console.error({resultText: `Error in JsonFile ${this.path}`, error});
        return {success: false, error};
    }
}

module.exports = JsonFile;