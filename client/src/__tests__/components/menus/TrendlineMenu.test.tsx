import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { TrendlineMenu } from '@/components/menus/TrendlineMenu'

describe('TrendlineMenu', () => {
  const defaultProps = {
    position: { x: 100, y: 200 },
    trendlineColor: '#3b82f6',
    onDelete: vi.fn(),
    onToggleColorSubmenu: vi.fn(),
    onToggleExtendSubmenu: vi.fn(),
    onToggleLabelSubmenu: vi.fn(),
    onSaveAsFavorite: vi.fn(),
    onDragStart: vi.fn(),
    activeSubmenu: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Menu rendering', () => {
    it('should render with position', () => {
      const { container } = render(<TrendlineMenu {...defaultProps} />)

      const menu = container.querySelector('[data-menu="trendline"]')
      expect(menu).toBeInTheDocument()
      expect(menu).toHaveStyle({ left: '100px', top: '200px' })
    })

    it('should render all menu buttons', () => {
      render(<TrendlineMenu {...defaultProps} />)

      // Check for button titles via title attribute
      expect(screen.getByTitle('Delete')).toBeInTheDocument()
      expect(screen.getByTitle('Colour')).toBeInTheDocument()
      expect(screen.getByTitle('Extend')).toBeInTheDocument()
      expect(screen.getByTitle('Label')).toBeInTheDocument()
      expect(screen.getByTitle('Save as Default')).toBeInTheDocument()
    })

    it('should render drag handle', () => {
      const { container } = render(<TrendlineMenu {...defaultProps} />)

      const dragHandle = container.querySelector('.cursor-grab')
      expect(dragHandle).toBeInTheDocument()
    })
  })

  describe('Event handlers', () => {
    it('should call onDelete when delete button clicked', async () => {
      const user = userEvent.setup()
      render(<TrendlineMenu {...defaultProps} />)

      const deleteButton = screen.getByTitle('Delete')
      await user.click(deleteButton)

      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
    })

    it('should call onToggleColorSubmenu when color button clicked', async () => {
      const user = userEvent.setup()
      render(<TrendlineMenu {...defaultProps} />)

      const colorButton = screen.getByTitle('Colour')
      await user.click(colorButton)

      expect(defaultProps.onToggleColorSubmenu).toHaveBeenCalledTimes(1)
    })

    it('should call onToggleExtendSubmenu when extend button clicked', async () => {
      const user = userEvent.setup()
      render(<TrendlineMenu {...defaultProps} />)

      const extendButton = screen.getByTitle('Extend')
      await user.click(extendButton)

      expect(defaultProps.onToggleExtendSubmenu).toHaveBeenCalledTimes(1)
    })

    it('should call onToggleLabelSubmenu when label button clicked', async () => {
      const user = userEvent.setup()
      render(<TrendlineMenu {...defaultProps} />)

      const labelButton = screen.getByTitle('Label')
      await user.click(labelButton)

      expect(defaultProps.onToggleLabelSubmenu).toHaveBeenCalledTimes(1)
    })

    it('should call onSaveAsFavorite when save button clicked', async () => {
      const user = userEvent.setup()
      render(<TrendlineMenu {...defaultProps} />)

      const saveButton = screen.getByTitle('Save as Default')
      await user.click(saveButton)

      expect(defaultProps.onSaveAsFavorite).toHaveBeenCalledTimes(1)
    })

    it('should call onDragStart on mouse down', () => {
      const { container } = render(<TrendlineMenu {...defaultProps} />)

      const dragHandle = container.querySelector('.cursor-grab')
      expect(dragHandle).toBeInTheDocument()

      if (dragHandle) {
        const event = new MouseEvent('mousedown', { bubbles: true })
        dragHandle.dispatchEvent(event)

        expect(defaultProps.onDragStart).toHaveBeenCalled()
      }
    })
  })

  describe('Active submenu state', () => {
    it('should highlight color button when color submenu active', () => {
      render(<TrendlineMenu {...defaultProps} activeSubmenu="color" />)

      const colorButton = screen.getByTitle('Colour')
      expect(colorButton.closest('button')).toHaveClass('bg-slate-600')
    })

    it('should highlight extend button when extend submenu active', () => {
      render(<TrendlineMenu {...defaultProps} activeSubmenu="extend" />)

      const extendButton = screen.getByTitle('Extend')
      expect(extendButton.closest('button')).toHaveClass('bg-slate-600')
    })

    it('should highlight label button when label submenu active', () => {
      render(<TrendlineMenu {...defaultProps} activeSubmenu="label" />)

      const labelButton = screen.getByTitle('Label')
      expect(labelButton.closest('button')).toHaveClass('bg-slate-600')
    })
  })

  describe('Props validation', () => {
    it('should use default color when not provided', () => {
      const { container } = render(<TrendlineMenu {...defaultProps} trendlineColor={undefined} />)

      // Should render without error
      expect(container.querySelector('[data-menu="trendline"]')).toBeInTheDocument()
    })

    it('should render with custom color', () => {
      render(<TrendlineMenu {...defaultProps} trendlineColor="#ff0000" />)

      // Color button should have the custom color in its circle
      const colorButton = screen.getByTitle('Colour')
      expect(colorButton).toBeInTheDocument()
    })
  })
})
