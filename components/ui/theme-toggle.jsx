import * as React from "react"
import { cn } from "../../lib/utils"

const ThemeToggle = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background hover:bg-accent hover:text-accent-foreground h-10 w-10 px-0",
        className
      )}
      onClick={() => {
        const html = document.documentElement
        const currentTheme = html.classList.contains('dark') ? 'dark' : 'light'
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
        
        if (newTheme === 'dark') {
          html.classList.add('dark')
        } else {
          html.classList.remove('dark')
        }
        
        localStorage.setItem('theme', newTheme)
      }}
      {...props}
    >
      <i className="fas fa-sun h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"></i>
      <i className="absolute fas fa-moon h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"></i>
      <span className="sr-only">Mudar tema</span>
    </button>
  )
})
ThemeToggle.displayName = "ThemeToggle"

export { ThemeToggle }