const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { test } = require("node:test");

const build = require("./build");

const projectRoot = path.resolve(__dirname, "..");

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      const address = server.address();
      assert.equal(typeof address, "object");
      assert.ok(address);
      resolve(address.port);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

function close(server) {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function setMetroPort(value) {
  if (value === undefined) {
    delete process.env.METRO_PORT;
  } else {
    process.env.METRO_PORT = value;
  }
}

test("selects an available port when Metro's conventional port is occupied", async () => {
  const previousPort = process.env.METRO_PORT;
  const conventionalPort = 8081;
  const server = net.createServer();

  try {
    setMetroPort(undefined);
    try {
      await listen(server, conventionalPort);
    } catch (error) {
      assert.equal(error.code, "EADDRINUSE");
    }

    const selectedPort = await build.findAvailableMetroPort();
    assert.notEqual(selectedPort, conventionalPort);
    assert.ok(selectedPort > 0 && selectedPort <= 65535);
  } finally {
    await close(server);
    setMetroPort(previousPort);
  }
});

test("validates and uses an explicit METRO_PORT", async () => {
  const previousPort = process.env.METRO_PORT;
  try {
    setMetroPort("43217");
    assert.equal(await build.findAvailableMetroPort(), 43217);

    for (const invalidPort of ["not-a-port", "0", "-1", "65536", "43217.5"]) {
      setMetroPort(invalidPort);
      await assert.rejects(
        build.findAvailableMetroPort(),
        new RegExp(`Invalid METRO_PORT value: "${invalidPort}"`),
      );
    }
  } finally {
    setMetroPort(previousPort);
  }
});

test("uses one selected port for status, bundles, manifests, asset parsing, and rewriting", async () => {
  const previousCwd = process.cwd();
  const previousPort = process.env.METRO_PORT;
  const requests = [];
  const timestamp = "metro-port-regression";
  const bundle = [
    'httpServerLocation:"/assets?unstable_path=assets%2Fimages",',
    'hash:"asset-hash",name:"icon",type:"png"',
  ].join("");
  const manifest = () => ({
    launchAsset: { url: "http://metro/bundle.js", key: "old-key" },
    extra: {
      expoClient: { hostUri: "metro" },
      expoGo: { debuggerHost: "metro", packagerOpts: { dev: true } },
    },
    assets: [{ hash: "asset-hash", url: "http://metro/asset" }],
  });
  const server = http.createServer((request, response) => {
    requests.push({
      host: request.headers.host,
      method: request.method,
      path: request.url,
    });

    if (request.url === "/status") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("packager-status:running");
      return;
    }

    if (request.url === "/manifest") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(manifest()));
      return;
    }

    if (request.url && request.url.includes(".bundle?")) {
      response.writeHead(200, { "content-type": "application/javascript" });
      response.end(bundle);
      return;
    }

    response.writeHead(404);
    response.end();
  });

  try {
    process.chdir(projectRoot);
    setMetroPort(undefined);
    const selectedPort = await listen(server);

    setMetroPort(String(selectedPort));
    assert.equal(await build.findAvailableMetroPort(), selectedPort);
    assert.equal(await build.checkMetroHealth(selectedPort), true);

    build.prepareDirectories(timestamp);
    await build.downloadBundle("ios", timestamp, selectedPort);
    await build.downloadBundle("android", timestamp, selectedPort);
    const manifests = {
      ios: await build.downloadManifest("ios", selectedPort),
      android: await build.downloadManifest("android", selectedPort),
    };

    assert.equal(manifests.ios.launchAsset.url, "http://metro/bundle.js");
    assert.equal(manifests.android.launchAsset.key, "old-key");

    const assets = build.extractAssets(timestamp, selectedPort);
    assert.equal(assets.length, 1);
    assert.deepEqual([...assets[0].platforms].sort(), ["android", "ios"]);
    assert.equal(assets[0].originalPath, "/assets?unstable_path=assets%2Fimages");

    build.updateBundleUrls(timestamp, "https://example.test", selectedPort);
    for (const platform of ["ios", "android"]) {
      const rewritten = fs.readFileSync(
        path.join(
          projectRoot,
          "static-build",
          timestamp,
          "_expo",
          "static",
          "js",
          platform,
          "bundle.js",
        ),
        "utf8",
      );
      assert.match(rewritten, /https:\/\/example\.test\/.*assets\/images/);
      assert.doesNotMatch(rewritten, /httpServerLocation:"\/assets\?/);
    }

    assert.equal(requests.length, 5);
    assert.ok(
      requests.every((request) => request.host === `localhost:${selectedPort}`),
    );
    assert.deepEqual(
      requests.map((request) => request.path),
      [
        "/status",
        "/artifacts/petrotrack/node_modules/expo-router/entry.bundle?platform=ios&dev=false&hot=false&lazy=false&minify=true",
        "/artifacts/petrotrack/node_modules/expo-router/entry.bundle?platform=android&dev=false&hot=false&lazy=false&minify=true",
        "/manifest",
        "/manifest",
      ],
    );
  } finally {
    await close(server);
    process.chdir(previousCwd);
    fs.rmSync(path.join(projectRoot, "static-build"), {
      recursive: true,
      force: true,
    });
    setMetroPort(previousPort);
  }
});