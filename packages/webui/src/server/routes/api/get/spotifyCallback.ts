import { type ApiHandler } from "../../../types.js";

const path: ApiHandler["path"] = "/spotifyCallback";

const handler: ApiHandler["handler"] = async (req, res) => {
	const deemix = req.app.get("deemix");
	const spotify = deemix.plugins.spotify;

	const { code, state, error } = req.query;

	if (error) {
		res.status(400).send(`<html><body><h2>Spotify Auth Error</h2><p>${error}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
		return;
	}

	if (!code || !state) {
		res.status(400).send(`<html><body><h2>Missing parameters</h2><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
		return;
	}

	// Hardcoded redirect URI — must match Spotify app dashboard exactly
	const redirectUri = `https://deemix.robertsons.cloud/api/spotifyCallback`;

	try {
		await spotify.handleAuthCallback(code as string, redirectUri, state as string);
		res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/?spotify_connected=1"></head><body></body></html>`);
	} catch (e) {
		res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/?spotify_error=${encodeURIComponent(e.message)}"></head><body></body></html>`);
	}
};

const apiHandler: ApiHandler = { path, handler };

export default apiHandler;