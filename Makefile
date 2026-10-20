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
install: package-lock.json
	@npm ci

.PHONY: clean
clean:
	@rm -rf node_modules out dist coverage test-results playwright-report

.PHONY: format
format: install
	@npm run format:check

.PHONY: lint
lint: install
	@npm run lint

.PHONY: typecheck
typecheck: install
	@npm run typecheck

.PHONY: run
run: install
	@npm run dev

.PHONY: test-all
test-all: test-unit test-socket test-live test-e2e

.PHONY: test-unit
test-unit: install
	@npm run test

.PHONY: test-socket
test-socket: install
	@npm run test:socket

.PHONY: test-live
test-live: install
	@npm run test:live

.PHONY: test-e2e
test-e2e: install
	@npm run build
	@npx playwright test
