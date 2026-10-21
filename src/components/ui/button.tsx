import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '#/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-display font-semibold tracking-wider transition-all disabled:pointer-events-none disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-gold/70 active:translate-y-px cursor-pointer',
  {
    variants: {
      variant: {
        gold: 'bg-gradient-to-b from-gold-soft to-gold text-ink-950 shadow-[0_0_24px_rgba(212,167,58,.25)] hover:brightness-110',
        ghost: 'border border-gold/30 text-parch hover:bg-gold/10 hover:border-gold/60',
        subtle: 'bg-ink-600 text-parch hover:bg-ink-500',
        danger: 'bg-infernal/90 text-white hover:bg-infernal',
        celestial: 'bg-celestial/90 text-ink-950 hover:bg-celestial',
      },
      size: { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-7 text-base', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'gold', size: 'md' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...p }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...p} />
))
Button.displayName = 'Button'
