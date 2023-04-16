import type { Config } from 'jest';

const config: Config = {
    roots: ["<rootDir>/tests"],
    moduleFileExtensions: ["ts", "js", "json"],
    testEnvironment: "jsdom",
    testRegex: "(/tests/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
    transform: {
        "^.+\\.tsx?$": "ts-jest",
    },
    collectCoverage: true
};

export default config;