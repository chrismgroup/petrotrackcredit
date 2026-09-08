throw new Error(
  [
    "The workspace root is not an Expo application.",
    "Run Expo commands through the root package wrappers, or from artifacts/petrotrack.",
    "For EAS commands, use: cd artifacts/petrotrack && eas <command>",
  ].join("\n"),
);