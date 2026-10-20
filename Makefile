# https://clarkgrubb.com/makefile-style-guide
MAKEFLAGS += --warn-undefined-variables
SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := pre-pr
.DELETE_ON_ERROR:
.SUFFIXES:

.PHONY: pre-pr
pre-pr: install format lint typecheck test-unit

.PHONY: install
install:
	@npm ci

node_modules/.package-lock.json: package-lock.json
	@npm ci

.PHONY: format
format: node_modules/.package-lock.json
	@npm run format:check

.PHONY: lint
lint: node_modules/.package-lock.json
	@npm run lint

.PHONY: typecheck
typecheck: node_modules/.package-lock.json
	@npm run typecheck

.PHONY: test-unit
test-unit: node_modules/.package-lock.json
	@npm run test

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
