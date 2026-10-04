import { Deezer, utils as dzUtils } from "deezer-sdk";
import { type ApiHandler } from "../../../types.js";
import { sessionDZ } from "../../../deemixApp.js";

const path: ApiHandler["path"] = "/getTracklist";

const handler: ApiHandler["handler"] = async (req, res) => {
	if (!sessionDZ[req.session.id]) sessionDZ[req.session.id] = new Deezer();
	const dz = sessionDZ[req.session.id];
	const deemix = req.app.get("deemix");

	const list_id = String(req.query.id);
	const list_type = String(req.query.type);
	switch (list_type) {
		case "artist": {
			const artistAPI = await dz.api.get_artist(list_id);
			(artistAPI as any).releases = await dz.gw.get_artist_discography_tabs(
				list_id,
				{
					limit: 100,
				}
			);
			res.send(artistAPI);
			break;
		}
		case "spotifyplaylist":
		case "spotify_playlist": {
			const spotify = deemix.plugins.spotify;
			if (!spotify.enabled) {
				res.send({
					collaborative: false,
					description: "",
					external_urls: { spotify: null },
					followers: { total: 0, href: null },
					id: null,
					images: [],
					name: "Something went wrong",
					owner: {
						display_name: "Error",
						id: null,
					},
					public: true,
					tracks: [],
					type: "playlist",
					uri: null,
				});
				break;
			}
			try {
				let playlist = await spotify.getPlaylistWithItems(list_id);
				if (!playlist) {
					const fallback = await spotify.generatePlaylistItemFromPage(
						dz,
						list_id,
						0
					);
					playlist = {
						collaborative: false,
						description: fallback.collection.playlistAPI.description ?? "",
						external_urls: {
							spotify: `https://open.spotify.com/playlist/${list_id}`,
						},
						followers: {
							total: fallback.collection.playlistAPI.fans ?? 0,
						},
						id: list_id,
						images: fallback.cover ? [{ url: fallback.cover }] : [],
						name: fallback.title,
						owner: {
							display_name: fallback.artist,
							id: fallback.collection.playlistAPI.creator?.id ?? null,
						},
						public: true,
						tracks: {
							items: fallback.conversionData.map((track) => ({ track })),
						},
						type: "playlist",
						uri: `spotify:playlist:${list_id}`,
					};
				}

				const tracklist = playlist.tracks.items;
				tracklist.forEach((item: any, i: number) => {
					tracklist[i] = item.track;
					if (!tracklist[i]) return;
					tracklist[i].selected = false;
				});
				playlist.tracks = tracklist.filter(Boolean);
				res.send(playlist);
			} catch (e: any) {
				const message = e?.message || "Unknown Spotify error";
				const name = e?.name || "";
				// Log without sensitive data (never log tokens)
				console.error(
					`[getTracklist] Spotify error for ${list_id}: ${name} ${message} status=${e?.status || ""}`
				);
				if (
					name === "SpotifyPlaylistAccessForbidden" ||
					message.includes(
						"Spotify no permite acceder al contenido de esta playlist"
					)
				) {
					res.status(403).send({
						error: message,
						errid: "spotifyAccessForbidden",
						status: 403,
					});
					break;
				}
				if (name === "SpotifyAuthFailed") {
					res.status(401).send({ error: message, status: 401 });
					break;
				}
				if (name === "SpotifyRateLimited") {
					res.status(429).send({ error: message, status: 429 });
					break;
				}
				// For other errors, preserve original message but never emit Bad OAuth wrapper
				if (message.includes("Bad OAuth request")) {
					res.status(500).send({
						error: "Spotify request failed. Please check authentication.",
						status: 500,
					});
					break;
				}
				res.status(500).send({ error: message, status: 500 });
			}
			break;
		}
		default: {
			let releaseAPI, releaseTracksAPI;
			try {
				releaseAPI = await dz.api[`get_${list_type}`](list_id);
				releaseTracksAPI = await dz.api[`get_${list_type}_tracks`](list_id);
				releaseTracksAPI = releaseTracksAPI.data;
			} catch {
				if (list_type === "playlist") {
					releaseAPI = dzUtils.map_playlist(
						await (
							await dz.gw.get_playlist_page(list_id)
						).DATA
					);
					releaseTracksAPI = await dz.gw.get_playlist_tracks(list_id);
				} else {
					releaseAPI = {};
					releaseTracksAPI = [];
				}
			}

			const tracks: any[] = [];
			const showdiscs =
				list_type === "album" &&
				releaseTracksAPI.length &&
				releaseTracksAPI[releaseTracksAPI.length - 1].disk_number !== 1;
			let current_disk = 0;

			releaseTracksAPI.forEach((track: any) => {
				if (track.SNG_ID) track = dzUtils.mapGwTrackToDeezer(track);
				if (showdiscs && parseInt(track.disk_number) !== current_disk) {
					current_disk = parseInt(track.disk_number);
					tracks.push({ type: "disc_separator", number: current_disk });
				}
				track.selected = false;
				tracks.push(track);
			});
			releaseAPI.tracks = tracks;
			res.send(releaseAPI);
			break;
		}
	}
};

const apiHandler: ApiHandler = { path, handler };

export default apiHandler;
