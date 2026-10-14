return {
  {
    "vim-airline/vim-airline",
    lazy = false, -- 确保启动即显示
    dependencies = {
      "vim-airline/vim-airline-themes", -- 主题插件作为依赖
    },
    init = function()
      -- 设置主题与功能（需终端支持 Nerd Fonts）
      vim.g.airline_powerline_fonts = 1
      vim.g.airline_theme = "dark" -- 可通过 :AirlineTheme 切换

      -- 标签栏与功能开关
      vim.g["airline#extensions#tabline#enabled"] = 1
      vim.g["airline#extensions#tabline#formatter"] = "jsformatter"
      vim.g["airline#extensions#whitespace#enabled"] = 0 -- 提升性能
    end,
  },
}
