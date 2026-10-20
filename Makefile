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

try_config_dir := $(CURDIR)/.maple-try

.PHONY: try
try: node_modules/.package-lock.json
	@mkdir -p $(try_config_dir)
	@cp $(HOME)/.config/maple/config.json $(try_config_dir)/config.json
	@MAPLE_CONFIG_DIR=$(try_config_dir) \
	    TMUX_TMPDIR=$(try_config_dir) \
	    npm run dev

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

app_dir := $(HOME)/.local/share/maple/app
apparmor_profile := /etc/apparmor.d/maple

.PHONY: package
package: node_modules/.package-lock.json
	@npm run build
	@npx electron-builder --linux dir

.PHONY: install
install: package
	@rm -rf $(app_dir)
	@mkdir -p $(dir $(app_dir))
	@cp -r dist/linux-unpacked $(app_dir)
	@rm -f $(HOME)/.local/bin/maple.AppImage
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
	    'Exec=env PATH=$(PATH) $(app_dir)/maple' \
	    'Icon=$(HOME)/.local/share/icons/maple.png' \
	    'Terminal=false' \
	    'Categories=Development;' \
	    > $(HOME)/.local/share/applications/maple.desktop
	@test -e $(apparmor_profile) || echo 'Run make install-apparmor so Maple can use the Claude sandbox.'

.PHONY: install-apparmor
install-apparmor:
	@sed \
	    's|@HOME@|$(HOME)|g' \
	    resources/apparmor/maple \
	    | sudo tee \
	    $(apparmor_profile) \
	    > /dev/null
	@sudo apparmor_parser \
	    -r \
	    $(apparmor_profile)
