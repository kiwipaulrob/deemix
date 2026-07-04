import { type ApiHandler } from "../../../types.js";

const path: ApiHandler["path"] = "/spotifyLogin";

const handler: ApiHandler["handler"] = (req, res) => {
	const deemix = req.app.get("deemix");
	const spotify = deemix.plugins.spotify;

	if (!spotify.enabled && !spotify.credentials.clientId) {
		res.status(400).json({ error: "Spotify credentials not configured" });
		return;
	}

	// Hardcoded redirect URI — must match Spotify app dashboard exactly
	const redirectUri = `https://deemix.robertsons.cloud/api/spotifyCallback`;

	const authUrl = spotify.getAuthUrl(redirectUri);
	res.send(`<html><body><script>window.location.href="${authUrl}";</script></body></html>`);
};

const apiHandler: ApiHandler = { path, handler };

export default apiHandler;