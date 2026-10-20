# https://clarkgrubb.com/makefile-style-guide
MAKEFLAGS += --warn-undefined-variables
SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := pre-pr
.DELETE_ON_ERROR:
.SUFFIXES:

.PHONY: pre-pr
pre-pr:
	@npm ci
	@npm run check

node_modules/.package-lock.json: package-lock.json
	@npm ci

.PHONY: run
run: node_modules/.package-lock.json
	@npm run dev

.PHONY: test-all
test-all: node_modules/.package-lock.json
	@npm run test:all

.PHONY: test-live
test-live: node_modules/.package-lock.json
	@npm run test:live

.PHONY: e2e
e2e: node_modules/.package-lock.json
	@npm run build
	@npx playwright test
