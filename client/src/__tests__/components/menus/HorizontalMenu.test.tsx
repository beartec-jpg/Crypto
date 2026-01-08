import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { HorizontalMenu } from '@/components/menus/HorizontalMenu'

describe('HorizontalMenu', () => {
  const defaultProps = {
    position: { x: 150, y: 250 },
    horizontalColor: '#facc15',
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onToggleColorSubmenu: vi.fn(),
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
      const { container } = render(<HorizontalMenu {...defaultProps} />)

      const menu = container.querySelector('[data-menu="horizontal"]')
      expect(menu).toBeInTheDocument()
      expect(menu).toHaveStyle({ left: '150px', top: '250px' })
    })

    it('should render all menu buttons', () => {
      render(<HorizontalMenu {...defaultProps} />)

      expect(screen.getByTitle('Delete')).toBeInTheDocument()
      expect(screen.getByTitle('Move')).toBeInTheDocument()
      expect(screen.getByTitle('Colour')).toBeInTheDocument()
      expect(screen.getByTitle('Label')).toBeInTheDocument()
      expect(screen.getByTitle('Save as Default')).toBeInTheDocument()
    })

    it('should render drag handle', () => {
      const { container } = render(<HorizontalMenu {...defaultProps} />)

      const dragHandle = container.querySelector('.cursor-grab')
      expect(dragHandle).toBeInTheDocument()
    })
  })

  describe('Event handlers', () => {
    it('should call onDelete when delete button clicked', async () => {
      const user = userEvent.setup()
      render(<HorizontalMenu {...defaultProps} />)

      const deleteButton = screen.getByTitle('Delete')
      await user.click(deleteButton)

      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
    })

    it('should call onMove when move button clicked', async () => {
      const user = userEvent.setup()
      render(<HorizontalMenu {...defaultProps} />)

      const moveButton = screen.getByTitle('Move')
      await user.click(moveButton)

      expect(defaultProps.onMove).toHaveBeenCalledTimes(1)
    })

    it('should call onToggleColorSubmenu when color button clicked', async () => {
      const user = userEvent.setup()
      render(<HorizontalMenu {...defaultProps} />)

      const colorButton = screen.getByTitle('Colour')
      await user.click(colorButton)

      expect(defaultProps.onToggleColorSubmenu).toHaveBeenCalledTimes(1)
    })

    it('should call onToggleLabelSubmenu when label button clicked', async () => {
      const user = userEvent.setup()
      render(<HorizontalMenu {...defaultProps} />)

      const labelButton = screen.getByTitle('Label')
      await user.click(labelButton)

      expect(defaultProps.onToggleLabelSubmenu).toHaveBeenCalledTimes(1)
    })

    it('should call onSaveAsFavorite when save button clicked', async () => {
      const user = userEvent.setup()
      render(<HorizontalMenu {...defaultProps} />)

      const saveButton = screen.getByTitle('Save as Default')
      await user.click(saveButton)

      expect(defaultProps.onSaveAsFavorite).toHaveBeenCalledTimes(1)
    })

    it('should call onDragStart on mouse down', () => {
      const { container } = render(<HorizontalMenu {...defaultProps} />)

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
      render(<HorizontalMenu {...defaultProps} activeSubmenu="h-color" />)

      const colorButton = screen.getByTitle('Colour')
      expect(colorButton.closest('button')).toHaveClass('bg-slate-600')
    })

    it('should highlight label button when label submenu active', () => {
      render(<HorizontalMenu {...defaultProps} activeSubmenu="h-label" />)

      const labelButton = screen.getByTitle('Label')
      expect(labelButton.closest('button')).toHaveClass('bg-slate-600')
    })
  })

  describe('Props validation', () => {
    it('should use default color when not provided', () => {
      const { container } = render(<HorizontalMenu {...defaultProps} horizontalColor={undefined} />)

      expect(container.querySelector('[data-menu="horizontal"]')).toBeInTheDocument()
    })

    it('should render with custom color', () => {
      render(<HorizontalMenu {...defaultProps} horizontalColor="#00ff00" />)

      const colorButton = screen.getByTitle('Colour')
      expect(colorButton).toBeInTheDocument()
    })
  })
})
