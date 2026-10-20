# https://clarkgrubb.com/makefile-style-guide
MAKEFLAGS += --warn-undefined-variables
SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := pre-pr
.DELETE_ON_ERROR:
.SUFFIXES:

.PHONY: pre-pr
pre-pr: format lint typecheck test-unit

node_modules/.package-lock.json: package-lock.json
	@npm ci

.PHONY: clean
clean:
	@rm -rf node_modules out dist coverage test-results playwright-report

.PHONY: format
format: node_modules/.package-lock.json
	@npm run format:check

.PHONY: lint
lint: node_modules/.package-lock.json
	@npm run lint

.PHONY: typecheck
typecheck: node_modules/.package-lock.json
	@npm run typecheck

.PHONY: run
run: node_modules/.package-lock.json
	@npm run dev

.PHONY: test-all
test-all: test-unit test-socket test-live test-e2e

.PHONY: test-unit
test-unit: node_modules/.package-lock.json
	@npm run test

.PHONY: test-socket
test-socket: node_modules/.package-lock.json
	@npm run test:socket

.PHONY: test-live
test-live: node_modules/.package-lock.json
	@npm run test:live

.PHONY: test-e2e
test-e2e: node_modules/.package-lock.json
	@npm run build
	@npx playwright test

.PHONY: package
package: node_modules/.package-lock.json
	@npm run build
	@npx electron-builder --linux AppImage

.PHONY: install
install: package
	@install \
	    -D \
	    -m 755 \
	    dist/maple.AppImage \
	    $(HOME)/.local/bin/maple.AppImage
	@install \
	    -D \
	    -m 644 \
	    resources/maple.png \
	    $(HOME)/.local/share/icons/maple.png
	@mkdir -p $(HOME)/.local/share/applications
	@printf '%s\n' \
	    '[Desktop Entry]' \
	    'Type=Application' \
	    'Name=Maple' \
	    'Exec=env PATH=$(PATH) $(HOME)/.local/bin/maple.AppImage' \
	    'Icon=$(HOME)/.local/share/icons/maple.png' \
	    'Terminal=false' \
	    'Categories=Development;' \
	    > $(HOME)/.local/share/applications/maple.desktop
