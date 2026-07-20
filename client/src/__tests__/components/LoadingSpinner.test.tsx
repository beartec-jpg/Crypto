import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LoadingSpinner } from '@/components/LoadingSpinner'

describe('LoadingSpinner', () => {
  describe('Rendering', () => {
    it('should render spinner element', () => {
      render(<LoadingSpinner />)

      const spinner = screen.getByRole('status')
      expect(spinner).toBeInTheDocument()
    })

    it('should show a cycling loading message by default', () => {
      render(<LoadingSpinner />)

      // Should show one of the cycling messages (any text in the paragraph)
      const paragraph = screen.getByRole('status').querySelector('p')
      expect(paragraph).toBeInTheDocument()
      expect(paragraph!.textContent).not.toBe('')
    })

    it('should show custom message', () => {
      render(<LoadingSpinner message="Please wait" />)

      expect(screen.getByText('Please wait')).toBeInTheDocument()
    })

    it('should not show message when empty string provided', () => {
      render(<LoadingSpinner message="" />)

      const paragraph = screen.getByRole('status').querySelector('p')
      expect(paragraph).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have ARIA role status', () => {
      render(<LoadingSpinner />)

      const spinner = screen.getByRole('status')
      expect(spinner).toBeInTheDocument()
    })

    it('should have aria-live polite', () => {
      render(<LoadingSpinner />)

      const spinner = screen.getByRole('status')
      expect(spinner).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('Size variants', () => {
    it('should render small spinner', () => {
      const { container } = render(<LoadingSpinner size="sm" />)

      const icon = container.querySelector('.h-4.w-4')
      expect(icon).toBeInTheDocument()
    })

    it('should render medium spinner', () => {
      const { container } = render(<LoadingSpinner size="md" />)

      const icon = container.querySelector('.h-8.w-8')
      expect(icon).toBeInTheDocument()
    })

    it('should render large spinner by default', () => {
      const { container } = render(<LoadingSpinner />)

      const icon = container.querySelector('.h-12.w-12')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should have animation class', () => {
      const { container } = render(<LoadingSpinner />)

      const icon = container.querySelector('.animate-spin')
      expect(icon).toBeInTheDocument()
    })

    it('should have correct color classes', () => {
      const { container } = render(<LoadingSpinner />)

      const icon = container.querySelector('.text-blue-500')
      expect(icon).toBeInTheDocument()
    })
  })
})
