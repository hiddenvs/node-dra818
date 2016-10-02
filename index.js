const util = require('util');
const EventEmitter = require('events').EventEmitter;
const SerialPort = require('serialport').SerialPort;

const DCS_CODES = [
	"023I", "025I", "026I", "031I", "032I", "043I", "047I", "051I", "065I",
	"071I", "072I", "073I", "074I", "114I", "115I", "116I", "125I", "131I",
	"132I", "134I", "143I", "152I", "155I", "156I", "162I", "172I", "174I",
	"205I", "223I", "226I", "243I", "244I", "245I", "251I", "261I", "263I",
	"265I", "271I", "306I", "311I", "315I", "331I", "343I", "346I", "351I",
	"364I", "365I", "371I", "411I", "412I", "413I", "423I", "431I", "432I",
	"445I", "464I", "465I", "466I", "503I", "506I", "516I", "532I", "546I",
	"565I", "606I", "612I", "624I", "627I", "631I", "632I", "654I", "662I",
	"664I", "703I", "712I", "723I", "731I", "732I", "734I", "743I", "754I",
	"023N", "025N", "026N", "031N", "032N", "043N", "047N", "051N", "065N",
	"071N", "072N", "073N", "074N", "114N", "115N", "116N", "125N", "131N",
	"132N", "134N", "143N", "152N", "155N", "156N", "162N", "172N", "174N",
	"205N", "223N", "226N", "243N", "244N", "245N", "251N", "261N", "263N",
	"265N", "271N", "306N", "311N", "315N", "331N", "343N", "346N", "351N",
	"364N", "365N", "371N", "411N", "412N", "413N", "423N", "431N", "432N",
	"445N", "464N", "465N", "466N", "503N", "506N", "516N", "532N", "546N",
	"565N", "606N", "612N", "624N", "627N", "631N", "632N", "654N", "662N",
	"664N", "703N", "712N", "723N", "731N", "732N", "734N", "743N", "754N"
];

DRA818 = {
	VHF : 0,
	UHF : 1,
	TCS : 0,
	DCS : 1
};

DRA818.Module = function (port, type) {

	var self = this;
	EventEmitter.call(this);
	
	this.handle = new SerialPort(port, { autoOpen : false });

	// Re-throw SerialPort events except 'open' and 'data'
	this.handle.on('error', (err) => { this.emit('error', err); });
	this.handle.on('disconnect', (err) => { this.emit('disconnect', err); });
	this.handle.on('close', () => { this.emit('close'); });

	var settings = {
		volume : 4,
		squelch : 4,
		narrow : true,
		txFrequency : type === DRA818.VHF ? '146.5200' : '446.0000',
		rxFrequency : type === DRA818.VHF ? '146.5200' : '446.0000',
		CSS : DRA818.TCS,
		txTCS : '0000',
		rxTCS : '0000',
		txDCS : '0000',
		rxDCS : '0000',
		tailtone : false,
		emphasis : false,
		highpass : false,
		lowpass : false
	};

	/*	Shadow settings object; these settings will be applied to
		'settings' above if we get success message from the DRA818 module. */
	var _settings = {};
	Object.keys(settings).forEach((k) => { _settings[k] = settings[k]; });

	function setGroup() {
		self.handle.write(
			util.format(
				'AT+DMOSETGROUP=%s,%s,%s,%s,%s,%s\r\n',
				_settings.narrow ? 0 : 1,
				_settings.txFrequency,
				_settings.rxFrequency,
				_settings.CSS === DRA818.TCS ? _settings.txTCS : _settings.txDCS,
				_settings.squelch,
				_settings.CSS === DRA818.TCS ? _settings.rxTCS : _settings.rxDCS
			)
		);
	}

	function setFilters() {
		self.handle.write(
			util.format(
				'AT+SETFILTER=%s,%s,%s\r\n',
				_settings.emphasis ? 1 : 0,
				_settings.highpass ? 1 : 0,
				_settings.lowpass ? 1 : 0
			)
		);
	}

	function expect(setting, value, expected, command) {
		_settings[setting] = value;
		self.handle.once(
			'data', (data) => {
				console.log(data.toString().trim());
				if (data.toString().trim() !== expected) {
					self.emit(
						'error', 'Failed to set ' + setting + ' to ' + value
					);
				} else {
					settings[setting] = value;
				}
			}
		);
	}

	function getSetInt(setting, min, max, pad, command, response) {
		Object.defineProperty(
			self, setting, {
				get : function () { return settings[setting]; },
				set : function (value) {
					value = parseInt(value);
					if (isNaN(value) || value < min || value > max) {
						self.emit('error', 'Invalid ' + setting + ': ' + value);
						return;
					}
					if (pad > 0) {
						value += '';
						while (value.length < pad) { value = '0' + value; }
					}
					if (response !== null) {
						expect(setting, value, response);
					} else {
						settings[setting] = value;
					}
					if (typeof command === 'string') {
						self.handle.write(command + value + '\r\n');
					} else if (typeof command === 'function') {
						command();
					}
				}
			}
		);
	}

	function getSetFloat(setting, min, max, command, response) {
		Object.defineProperty(
			self, setting, {
				get : function () { return settings[setting]; },
				set : function (value) {
					value = parseFloat(value);
					if (isNaN(value) || value < min || value > max) {
						self.emit('error', 'Invalid ' + setting + ': ' + value);
						return;
					}
					value = value.toFixed(4);
					expect(setting, value, response);
					command();
				}
			}
		);
	}

	function getSetBool(setting, command, response) {
		Object.defineProperty(
			self, setting, {
				get : function () { return settings[setting]; },
				set : function (value) {
					if (typeof value !== 'boolean') {
						self.emit('error', 'Invalid ' + setting + ': ' + value);
						return;
					}
					expect(setting, value, response);
					if (typeof command === 'string') {
						self.handle.write(command + (value ? 1 : 0) + '\r\n');
					} else if (typeof command === 'function') {
						command();
					}
				}
			}
		);
	}

	function getSetString(setting, arr, command, response) {
		Object.defineProperty(
			self, setting, {
				get : function () { return settings[setting]; },
				set : function (value) {
					if (arr.indexOf(value) < 0) {
						self.emit('error', 'Invalid ' + setting + ': ' + value);
						return;
					}
					expect(setting, value, response);
					command();
				}
			}
		);
	}

	getSetInt('volume', 1, 8, 0, 'AT+DMOSETVOLUME=', '+DMOSETVOLUME:0');
	getSetInt('squelch', 0, 8, 0, setGroup, '+DMOSETGROUP:0');
	getSetInt('rxTCS', 0, 38, 4, setGroup, '+DMOSETGROUP:0');
	getSetInt('txTCS', 0, 38, 4, setGroup, '+DMOSETGROUP:0');
	getSetInt('CSS', 0, 1, 0, null, null);

	if (type === DRA818.VHF) {
		getSetFloat('txFrequency', 134, 174, setGroup, '+DMOSETGROUP:0');
		getSetFloat('rxFrequency', 134, 174, setGroup, '+DMOSETGROUP:0');
	} else {
		getSetFloat('txFrequency', 400, 480, setGroup, '+DMOSETGROUP:0');
		getSetFloat('rxFrequency', 400, 480, setGroup, '+DMOSETGROUP:0');		
	}

	getSetBool('narrow', setGroup, '+DMOSETGROUP:0');
	getSetBool('emphasis', setFilters, '+DMOSETFILTER:0');
	getSetBool('highpass', setFilters, '+DMOSETFILTER:0');
	getSetBool('lowpass', setFilters, '+DMOSETFILTER:0');
	getSetBool('tailtone', 'AT+SETFILTER=', '+DMOSETFILTER:0');

	getSetString('txDCS', DCS_CODES, setGroup, '+DMOSETGROUP:0');
	getSetString('rxDCS', DCS_CODES, setGroup, '+DMOSETGROUP:0');

	this.open = function (callback) {
		this.handle.on(
			'open', () => {
				this.handle.once(
					'data', (data) => {
						data = data.toString().trim();
						if (data !== '+DMOCONNECT:0') {
							callback('Failed to connect to radio: ' + data);
						} else {
							callback(null);
						}
					}
				);
				this.handle.write('AT+DMOCONNECT\r\n');
			}
		);
		this.handle.open((err) => { console.log(err); });
	}

	this.close = this.handle.close;

	this.getRSSI = function (callback) {
		this.handle.once(
			'data', (data) => {
				var rssi = data.toString().trim().match(/^RSSI=(\d+)$/);
				if (rssi === null) {
					callback(data.toString().trim(), null);
				} else {
					callback(null, parseInt(rssi[1]));
				}
			}
		);
		this.handle.write('RSSI?\r\n');
	}

}
util.inherits(DRA818.Module, EventEmitter);

module.exports = DRA818;