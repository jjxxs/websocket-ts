import type { Config } from 'jest';

const config: Config = {
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
    collectCoverageFrom: [
        '**/*.{js,jsx}',
        '!**/node_modules/**'
    ],
    coverageReporters: ['json', 'lcov', 'text', 'clover'],
};

export default config;