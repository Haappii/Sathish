// Metro configuration for React Native + Expo
// Force axios to use its browser build so Metro doesn't try to load Node's crypto/http modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const axiosPkg = require("axios/package.json");
const axiosBrowserExport =
  (axiosPkg &&
    axiosPkg.exports &&
    axiosPkg.exports["."] &&
    axiosPkg.exports["."]["react-native"] &&
    axiosPkg.exports["."]["react-native"].require) ||
  "./dist/browser/axios.cjs";

const axiosBrowserPath = path.join(
  path.dirname(require.resolve("axios/package.json")),
  String(axiosBrowserExport).replace("./", "")
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "axios") {
    return {
      type: "sourceFile",
      filePath: axiosBrowserPath,
    };
  }
  return context.resolveRequest
    ? context.resolveRequest(context, moduleName, platform)
    : null;
};

module.exports = config;
