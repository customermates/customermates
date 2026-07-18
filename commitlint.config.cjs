module.exports = {
  defaultIgnores: false,
  extends: ["@commitlint/config-conventional"],
  parserPreset: {
    parserOpts: {
      headerCorrespondence: ["type", "scope", "subject"],
      headerPattern: /^([a-z]+)(?:\(([a-z0-9]+(?:-[a-z0-9]+)*)\))?!?: ([a-z0-9].+[^.])$/,
    },
  },
  rules: {
    "body-max-line-length": [0],
  },
};
