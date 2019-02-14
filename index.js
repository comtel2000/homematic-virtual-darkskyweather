var path = require('path');
var DarkSkyPlatform = require(path.join(__dirname, '/DarkSkyPlatform'));

module.exports = function (server, name, logger, instance) {
  this.name = name;
  this.instance = instance;
  this.initialized = false;
  this.platform = new DarkSkyPlatform(this, name, server, logger, instance);
  this.platform.init();

  this.handleConfigurationRequest = function (dispatchedRequest) {
    this.platform.handleConfigurationRequest(dispatchedRequest);
  }
}

