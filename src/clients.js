// Generated from imba/src/clients.imba; edit the Imba source.

/*body*/
// The apps that may be linked to an account through the device flow (src/device.js), the
// scopes each may ask for, and the first version of each that knows how to link. Also the
// mod ids a gallery shot may be tagged with.
import mods from './mods-data.js';

export const SCOPES = Object.freeze({'gallery:upload': 'Share screenshots to the gallery in your name','almanac:submit': 'Submit benchmark results to the Almanac leaderboard in your name'});

export const CLIENTS = Object.freeze({ghostty: Object.freeze({name: 'Ghostty in FFXIV',scopes: Object.freeze(['gallery:upload']),min_version: '0.3.0'}),almanac: Object.freeze({name: 'Almanac',scopes: Object.freeze(['almanac:submit']),min_version: '0.2.0'})});

export const MOD_IDS = Object.freeze(
	mods.mods.filter(
		function(m) {
			return (m.gallery !== false);
		}
	).map(
		function(m) {
			return (m.id || m.internalName.toLowerCase().replace(new RegExp('dalamud$',''),''));
		}
	)
);

export const isModId = function(id) {
	return (((typeof id) === 'string') && MOD_IDS.includes(id));
};
