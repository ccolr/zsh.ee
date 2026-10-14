# starship
if [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]]; then
    export STARSHIP_CONFIG=~/.config/starship/apple.toml
elif [[ "${TERM_PROGRAM:-}" == "ghostty" ]]; then
    export STARSHIP_CONFIG=~/.config/starship/ghostty.toml
elif [[ "${TERM_PROGRAM:-}" == "vscode" ]]; then
    export STARSHIP_CONFIG=~/.config/starship/vscode.toml
else
    export STARSHIP_CONFIG=~/.config/starship/default.toml
fi
eval "$(starship init bash)"
