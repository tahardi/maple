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

.PHONY: run
run:
	@npm run dev

.PHONY: e2e
e2e:
	@npm run build
	@npx playwright test
