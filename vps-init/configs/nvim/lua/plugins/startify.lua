return {
  "mhinz/vim-startify",
  lazy = false,
  config = function()
    vim.g.startify_lists = {
      { type = "files", header = { "   Recent Files" } },
      { type = "dir", header = { "   Current Directory" } },
      { type = "sessions", header = { "   Sessions" } },
      { type = "bookmarks", header = { "   Bookmarks" } },
    }
    vim.g.startify_bookmarks = {
      { c = "~/.config/nvim/init.lua" },
      { z = "~/.zshrc" },
    }
    vim.g.startify_session_persistence = 1
    vim.g.startify_change_to_dir = 1
  end,
}
