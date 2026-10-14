### fzf
export FZF_DEFAULT_COMMAND="fd -H --exclude={.git,.idea,.vscode,.sass-cache,node_modules,build} --type f"
export FZF_DEFAULT_OPTS="--style full --layout reverse --preview 'fzf-preview.sh {}'"
# Preview file content using bat (https://github.com/sharkdp/bat)
export FZF_CTRL_T_OPTS="
    --walker-skip .git,node_modules,target
    --preview 'bat -n --color=always {}'"
# CTRL-R has no preview
export FZF_CTRL_R_OPTS="--no-preview"
# Print tree structure in the preview window
export FZF_ALT_C_OPTS="
    --walker-skip .git,node_modules,target
    --preview 'tree -C {}'"
# Use ** as the trigger sequence
export FZF_COMPLETION_TRIGGER='**'
# Options to fzf command
export FZF_COMPLETION_OPTS='--border --info=inline'
# Options for path completion (e.g. vim **<TAB>)
export FZF_COMPLETION_PATH_OPTS='--walker file,dir,follow,hidden'
# Options for directory completion (e.g. cd **<TAB>)
export FZF_COMPLETION_DIR_OPTS="--walker dir,follow"

# Advanced customization of fzf options via _fzf_comprun function
_fzf_comprun() {
    local command=$1
    shift
    case "$command" in
        cd)           fzf --preview 'tree -C {} | head -200' "$@" ;;
        export|unset) fzf --preview "eval 'echo \$'{}" "$@" ;;
        ssh)          fzf --preview 'dig {}' "$@" ;;
        *)            fzf --preview 'bat -n --color=always {}' "$@" ;;
    esac
}

# Use fd for listing path candidates.
_fzf_compgen_path() {
    fd --hidden --follow --exclude ".git" . "$1"
}

# Use fd to generate the list for directory completion.
_fzf_compgen_dir() {
    fd --type d --hidden --follow --exclude ".git" . "$1"
}

ef() {
    local files
    IFS=$'\n' files=($(find . -maxdepth 1 -type f | sed 's|^\./||' | \
        fzf-tmux --query="$1" --multi --select-1 --exit-0))
    [[ -n "$files" ]] && ${EDITOR:-vim} "${files[@]}"
}

cf() {
    local dir
    dir=$(find "${1:-.}" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | fzf --preview 'tree -C {}' +m) &&
    cd "$dir"
}
### fzf end
