su() {
    command su --whitelist-environment=TERM_PROGRAM "$@"
}
