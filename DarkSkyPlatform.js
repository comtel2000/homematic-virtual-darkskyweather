//
//  DarkSkyPlatform.js
//  Homematic Virtual Interface Plugin
//
//
'use strict'

const path = require('path');
var appRoot = path.dirname(require.main.filename);
if (appRoot.endsWith('bin')) { appRoot = appRoot + '/../lib'; }

const fs = require('fs');
if (appRoot.endsWith('node_modules/daemonize2/lib')) {
	appRoot = path.join(appRoot, '..', '..', '..', 'lib');
	if (!fs.existsSync(path.join(appRoot, 'HomematicVirtualPlatform.js'))) {
		appRoot = path.join(path.dirname(require.main.filename), '..', '..', '..', 'node_modules', 'homematic-virtual-interface', 'lib');
	}
}

appRoot = path.normalize(appRoot);

var HomematicVirtualPlatform = require(appRoot + '/HomematicVirtualPlatform.js');

const util = require('util');
const url = require('url');
const request = require('request');

var HomematicDevice;

function DarkSkyPlatform(plugin, name, server, log, instance) {
	DarkSkyPlatform.super_.apply(this, arguments);
	server.publishHMDevice('DarkSky', 'HM-WDS100-C6-O', path.join(__dirname, 'HM-WDS100-C6-O.json'), 2);
	HomematicDevice = server.homematicDevice;
}

util.inherits(DarkSkyPlatform, HomematicVirtualPlatform);

DarkSkyPlatform.prototype.init = function () {
	this.hmDevice = new HomematicDevice(this.getName());
	this.hmDevice.initWithType('HM-WDS100-C6-O', 'DarkSky');
	this.bridge.addDevice(this.hmDevice);
	this.plugin.initialized = true;
	this.localization = require(appRoot + '/Localization.js')(__dirname + '/Localizable.strings');
	this.log.info('initialization completed %s', this.plugin.initialized);
	this.fetchWeather(true);
}

DarkSkyPlatform.prototype.shutdown = function () {
	try {
		clearTimeout(this.refreshTimer);
	} catch (e) {
		this.log.error("Shutown error %s", e.stack);
	}
}


DarkSkyPlatform.prototype.showSettings = function (dispatched_request) {
	var result = [];
	this.localization.setLanguage(dispatched_request);
	var key_secret = this.config.getValueForPlugin(this.name, 'key_secret');
	var latitude = this.config.getValueForPlugin(this.name, 'latitude');
	var longitude = this.config.getValueForPlugin(this.name, 'longitude');

	result.push({
		'control': 'text', 'name': 'key_secret',
		'label': this.localization.localize('DarkSky Secret Key'),
		'value': key_secret,
		'description': this.localization.localize('Register your secret key at https://darksky.net/dev')
	});

	result.push({
		'control': 'text', 'name': 'latitude',
		'label': this.localization.localize('Latitude'),
		'value': latitude,
		'description': this.localization.localize('Enter Latitude')
	});

	result.push({
		'control': 'text', 'name': 'longitude',
		'label': this.localization.localize('Longitude'),
		'value': longitude,
		'description': this.localization.localize('Enter Longitude')
	});

	return result;
}

DarkSkyPlatform.prototype.saveSettings = function (settings) {
	var that = this
	if (settings.key_secret) {
		this.config.setValueForPlugin(this.name, 'key_secret', settings.key_secret);
	}
	if (settings.latitude) {
		this.config.setValueForPlugin(this.name, 'latitude', settings.latitude);
	}
	if (settings.longitude) {
		this.config.setValueForPlugin(this.name, 'longitude', settings.longitude);
	}
	clearTimeout(that.refreshTimer);
	this.fetchWeather(true);
}

DarkSkyPlatform.prototype.fetchWeather = function (force) {
	this.debug.debug('Fetch DarkSky Weather (force update: %s)', force);
	var that = this;
	var key_secret = this.config.getValueForPlugin(this.name, 'key_secret');
	var latitude = this.config.getValueForPlugin(this.name, 'latitude');
	var longitude = this.config.getValueForPlugin(this.name, 'longitude');

	if (!key_secret || !latitude || !longitude) {
		this.log.error('data missing - abort');
		return;
	}
	var requestUrl = 'https://api.darksky.net/forecast/' + key_secret + '/' + latitude + ',' + longitude;
	var parameter = { lang: 'de', units: 'si', exclude: 'minutely,hourly,daily,alerts,flags' };

	request({
		url: requestUrl,
		qs: parameter,
		gzip: true,
		json: true
	}, function (error, response, body) {
		that.log.debug('response: %s', response.statusCode);
		if (error) {
			that.log.error(error);
			return;
		}
		try {
			var channel = that.hmDevice.getChannelWithTypeAndIndex('WEATHER', '1');
			if (channel) {
				channel.updateValue('TEMPERATURE', body.currently.temperature, true, force);
				channel.updateValue('HUMIDITY', parseInt(body.currently.humidity * 100), true, force);
				if (body.currently.precipIntensity) {
					channel.updateValue('RAIN_COUNTER', body.currently.precipIntensity, true, force);
				} else {
					channel.updateValue('RAIN_COUNTER', 0, true, force);
				}
				if (body.currently.precipIntensity && body.currently.precipIntensity > 0.1) {
					channel.updateValue('RAINING', true, true, force);
				} else {
					channel.updateValue('RAINING', false, true, force);
				}
				channel.updateValue('WIND_SPEED', (body.currently.windSpeed * 3.6), true, force);
				channel.updateValue('WIND_DIRECTION', body.currently.windBearing, true, force);

				channel.updateValue('WIND_DIRECTION_RANGE', 0, true, force);
				channel.updateValue('SUNSHINEDURATION', 0, true, force);
				channel.updateValue('BRIGHTNESS', body.currently.uvIndex, true, force);
				var summary = body.currently.summary.split('ä').join('ae').split('ü').join('ue').split('ö').join('oe').split('Ä').join('Ae').split('Ü').join('Ue').split('Ö').join('Oe');
				//iconv.decode(new Buffer(body.currently.summary), 'ISO-8859-1')
				channel.updateValue('SUMMARY', summary, true, force);
				channel.updateValue('DEWPOINT', body.currently.dewPoint, true, force);
			}

		} catch (e) {
			that.log.error('Unable to parse weather %s', e);
		}

	});

	that.refreshTimer = setTimeout(function () { that.fetchWeather(false) }, 900000); // -> 15min (900000)
}

DarkSkyPlatform.prototype.handleConfigurationRequest = function (dispatchedRequest) {
	var template = 'index.html';
	var requesturl = dispatchedRequest.request.url;
	var queryObject = url.parse(requesturl, true).query;
	var deviceList = '';
	if (queryObject['do'] !== undefined) {
		switch (queryObject['do']) {
			case 'app.js':
				{
					template = 'app.js';
				}
				break;
		}
	}
	dispatchedRequest.dispatchFile(this.plugin.pluginPath, template, { 'listDevices': deviceList });
}

module.exports = DarkSkyPlatform
