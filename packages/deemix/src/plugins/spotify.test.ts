import { describe, expect, it, vi, beforeEach } from "vitest";

import SpotifyPlugin from "./spotify.js";

const { gotGetMock, gotPostMock } = vi.hoisted(() => ({
	gotGetMock: vi.fn(),
	gotPostMock: vi.fn(),
}));

vi.mock("got", () => {
	return {
		default: {
			get: gotGetMock,
			post: gotPostMock,
		},
	};
});

function createGotError(status: number, message: string) {
	const error: any = new Error(message);
	error.response = {
		statusCode: status,
		body: JSON.stringify({ error: { status, message } }),
	};
	error.statusCode = status;
	return error;
}

beforeEach(() => {
	vi.clearAllMocks();
	gotPostMock.mockReturnValue({
		json: vi.fn(async () => ({
			access_token: "client-token",
			expires_in: 3600,
		})),
	});
});

describe("SpotifyPlugin playlist fallback", () => {
	it("uses the 2026 items endpoint and normalizes item entries", async () => {
		const tracks = ["TRACK001", "TRACK002"].map((id) => ({
			id,
			explicit: false,
			name: `Track ${id}`,
			artists: [{ name: "Artist" }],
			album: { name: "Album" },
		}));
		const nextUrl =
			"https://api.spotify.com/v1/playlists/test/items?offset=1&limit=1";

		gotGetMock.mockImplementation((url: string) => ({
			json: vi.fn(async () => {
				if (url.includes("/items?")) {
					return {
						items: [{ item: tracks[1] }],
						next: null,
						total: 2,
					};
				}
				return {
					id: "test",
					name: "Test playlist",
					owner: { id: "owner", display_name: "Owner", href: "" },
					images: [],
					snapshot_id: "snapshot",
					collaborative: false,
					description: "",
					followers: { total: 0 },
					external_urls: {
						spotify: "https://open.spotify.com/playlist/test",
					},
					public: true,
					items: {
						items: [{ item: tracks[0] }],
						next: nextUrl,
						total: 2,
					},
				};
			}),
		}));

		const plugin = new SpotifyPlugin("/tmp/deemix-spotify-test/");
		plugin.enabled = true;
		plugin.oauthTokens = {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			expiresAt: Date.now() + 60 * 60 * 1000,
		};

		const dz = {
			api: {
				get_artist: vi.fn(async () => ({ id: 5080, name: "Various Artists" })),
			},
		} as any;

		const result = await plugin.generatePlaylistItem(dz, "test", 1);

		expect(result.conversionData.map((track) => track.id)).toEqual([
			"TRACK001",
			"TRACK002",
		]);
		expect(gotGetMock).toHaveBeenCalledWith(
			"https://api.spotify.com/v1/playlists/test/items?limit=1&offset=1",
			expect.any(Object)
		);
		expect(gotGetMock.mock.calls.some(([url]) => url.includes("/tracks"))).toBe(
			false
		);
	});

	it("uses embed page IDs when playlist page only has preview items", async () => {
		const mainHtml = `
			<html>
				<head>
					<meta property="og:title" content="70s Rock Drive" />
					<meta property="og:image" content="https://img.test/cover.jpg" />
					<meta name="music:creator" content="https://open.spotify.com/user/spotify" />
					<meta name="description" content="Playlist · Spotify · 3 items" />
					<meta name="music:song" content="https://open.spotify.com/track/TRACK001" />
					<meta name="music:song" content="https://open.spotify.com/track/TRACK002" />
				</head>
			</html>
		`;

		// Embed page has all IDs, including TRACK003 missing from main HTML.
		const embedHtml = `
			<html>
				<body>
					<script>
						window.__EMBED_STATE__ = {
							tracks: [
								"spotify:track:TRACK001",
								"spotify:track:TRACK002",
								"spotify:track:TRACK003"
							]
						};
					</script>
				</body>
			</html>
		`;

		gotGetMock.mockImplementation(async (url: string) => {
			if (url.includes("/embed/playlist/")) return { body: embedHtml };
			return { body: mainHtml };
		});

		const plugin = new SpotifyPlugin("/tmp/deemix-spotify-test/").setup();
		plugin.getPlaylistFromWebApi = vi.fn().mockResolvedValue(null);
		plugin.sp = {
			tracks: {
				get: vi.fn(async (id: string) => ({
					id,
					explicit: false,
					name: `Track ${id}`,
					artists: [{ name: "Artist" }],
					album: { name: "Album" },
				})),
			},
		} as any;
		plugin.enabled = true;

		const dz = {
			api: {
				get_artist: vi.fn(async () => ({ id: 5080, name: "Various Artists" })),
			},
		} as any;

		const result = await plugin.generatePlaylistItemFromPage(dz, "test", 1);
		const ids = result.conversionData.map((track) => track.id).sort();

		expect(result.size).toBe(3);
		expect(ids).toEqual(["TRACK001", "TRACK002", "TRACK003"]);
		expect(gotGetMock).toHaveBeenCalledWith(
			expect.stringContaining("/embed/playlist/"),
			expect.any(Object)
		);
	});

	describe("error handling for /items", () => {
		it("normalizes 200 response with items[].item shape", async () => {
			const track = {
				id: "TRACK_NESTED",
				explicit: false,
				name: "Nested Track",
				artists: [{ name: "Artist" }],
				album: { name: "Album" },
			};
			gotGetMock.mockImplementation((url: string) => ({
				json: vi.fn(async () => {
					if (url.includes("/items")) {
						return { items: [{ item: track }], next: null, total: 1 };
					}
					return {
						id: "test",
						name: "Test",
						owner: { id: "owner", display_name: "Owner", href: "" },
						images: [],
						snapshot_id: "snap",
						collaborative: false,
						description: "",
						followers: { total: 0 },
						external_urls: {
							spotify: "https://open.spotify.com/playlist/test",
						},
						public: true,
						items: { items: [{ item: track }], next: null, total: 1 },
					};
				}),
			}));

			const plugin = new SpotifyPlugin("/tmp/deemix-spotify-test/");
			plugin.enabled = true;
			plugin.oauthTokens = {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			};

			const dz = {
				api: {
					get_artist: vi.fn(async () => ({
						id: 5080,
						name: "Various Artists",
					})),
				},
			} as any;

			const result = await plugin.generatePlaylistItem(dz, "test", 1);
			expect(result.conversionData[0].id).toBe("TRACK_NESTED");
			expect(
				gotGetMock.mock.calls.some(([url]) => url.includes("/tracks"))
			).toBe(false);
		});

		it("throws SpotifyPlaylistAccessForbidden on 403 and not Bad OAuth", async () => {
			gotGetMock.mockImplementation(() => ({
				json: vi.fn(async () => {
					throw createGotError(403, "Forbidden");
				}),
			}));

			const plugin = new SpotifyPlugin("/tmp/deemix-spotify-test/");
			plugin.enabled = true;
			plugin.oauthTokens = {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			};

			await expect(
				plugin.getPlaylistWithItems("test403")
			).rejects.toMatchObject({
				name: "SpotifyPlaylistAccessForbidden",
			});
			try {
				await plugin.getPlaylistWithItems("test403");
			} catch (e: any) {
				expect(e.message).toBe(
					"Spotify no permite acceder al contenido de esta playlist con el usuario autenticado. En Development Mode, la playlist debe ser propiedad del usuario o ser colaborativa."
				);
				expect(e.message).not.toContain("Bad OAuth");
				expect(e.message).not.toContain("Bad OAuth request");
			}
			expect(
				gotGetMock.mock.calls.some(([url]) => url.includes("/tracks"))
			).toBe(false);
			// Ensure endpoint used was /items or /playlists, not /tracks
			const urls = gotGetMock.mock.calls.map(([u]) => u as string);
			expect(urls.some((u) => u.includes("/playlists/test403"))).toBe(true);
			expect(urls.some((u) => u.includes("/playlists/test403/tracks"))).toBe(
				false
			);
		});

		it("throws SpotifyAuthFailed on 401", async () => {
			gotGetMock.mockImplementation(() => ({
				json: vi.fn(async () => {
					throw createGotError(401, "Unauthorized");
				}),
			}));
			const plugin = new SpotifyPlugin("/tmp/deemix-spotify-test/");
			plugin.enabled = true;
			plugin.oauthTokens = {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			};
			await expect(
				plugin.getPlaylistWithItems("test401")
			).rejects.toMatchObject({
				name: "SpotifyAuthFailed",
			});
			try {
				await plugin.getPlaylistWithItems("test401");
			} catch (e: any) {
				expect(e.message).toContain("401");
				expect(e.message).not.toContain("Bad OAuth");
			}
		});

		it("throws SpotifyRateLimited on 429", async () => {
			gotGetMock.mockImplementation(() => ({
				json: vi.fn(async () => {
					throw createGotError(429, "Too Many Requests");
				}),
			}));
			const plugin = new SpotifyPlugin("/tmp/deemix-spotify-test/");
			plugin.enabled = true;
			plugin.oauthTokens = {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			};
			await expect(
				plugin.getPlaylistWithItems("test429")
			).rejects.toMatchObject({
				name: "SpotifyRateLimited",
			});
			try {
				await plugin.getPlaylistWithItems("test429");
			} catch (e: any) {
				expect(e.message).toContain("429");
			}
		});

		it("never uses /playlists/{id}/tracks for items", async () => {
			const track = {
				id: "T1",
				explicit: false,
				name: "T1",
				artists: [{ name: "Artist" }],
				album: { name: "Album" },
			};
			const nextUrl =
				"https://api.spotify.com/v1/playlists/test/items?offset=1&limit=1";
			gotGetMock.mockImplementation((url: string) => ({
				json: vi.fn(async () => {
					if (url.includes("/items?")) {
						return { items: [{ item: track }], next: null, total: 2 };
					}
					return {
						id: "test",
						name: "Test",
						owner: { id: "owner", display_name: "Owner", href: "" },
						images: [],
						snapshot_id: "snap",
						collaborative: false,
						description: "",
						followers: { total: 0 },
						external_urls: {
							spotify: "https://open.spotify.com/playlist/test",
						},
						public: true,
						items: { items: [{ item: track }], next: nextUrl, total: 2 },
					};
				}),
			}));
			const plugin = new SpotifyPlugin("/tmp/deemix-spotify-test/");
			plugin.enabled = true;
			plugin.oauthTokens = {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			};
			const dz = {
				api: { get_artist: vi.fn(async () => ({ id: 5080 })) },
			} as any;
			await plugin.generatePlaylistItem(dz, "test", 1);
			const allUrls = gotGetMock.mock.calls.map(([u]) => u as string).join(" ");
			expect(allUrls).toContain("/playlists/test/items");
			expect(allUrls).not.toContain("/playlists/test/tracks");
		});

		it("preserves original error for non-403/401/429 (e.g., 500)", async () => {
			gotGetMock.mockImplementation(() => ({
				json: vi.fn(async () => {
					throw createGotError(500, "Internal Server Error");
				}),
			}));
			const plugin = new SpotifyPlugin("/tmp/deemix-spotify-test/");
			plugin.enabled = true;
			plugin.oauthTokens = {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			};
			await expect(plugin.getPlaylistWithItems("test500")).rejects.toThrow(
				"Internal Server Error"
			);
		});
	});
});
