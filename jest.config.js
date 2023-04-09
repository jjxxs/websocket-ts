module.exports = {
    roots: ["<rootDir>/tests"],
    moduleDirectories: ["node_modules", "src"],
    moduleFileExtensions: ['js', 'ts', 'json'],
    testEnvironment: "jsdom",
    testRegex: "^.+\\.test\\.ts$",
    testPathIgnorePatterns: ["/node_modules/", "/dist/"],
    transform: {
        "^.+\\.tsx?$": "ts-jest",
    },
    collectCoverage: true,
};