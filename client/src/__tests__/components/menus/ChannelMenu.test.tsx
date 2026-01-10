import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelMenu } from '@/components/menus/ChannelMenu'

describe('ChannelMenu', () => {
  const defaultProps = {
    position: { x: 200, y: 300 },
    channelColor: '#22c55e',
    onDelete: vi.fn(),
    onMove: vi.fn(),
    onToggleColorSubmenu: vi.fn(),
    onToggleLinesSubmenu: vi.fn(),
    onSaveAsFavorite: vi.fn(),
    onDragStart: vi.fn(),
    activeSubmenu: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Menu rendering', () => {
    it('should render with position', () => {
      const { container } = render(<ChannelMenu {...defaultProps} />)

      const menu = container.querySelector('[data-menu="channel"]')
      expect(menu).toBeInTheDocument()
      expect(menu).toHaveStyle({ left: '200px', top: '300px' })
    })

    it('should render all menu buttons', () => {
      render(<ChannelMenu {...defaultProps} />)

      expect(screen.getByTitle('Delete')).toBeInTheDocument()
      expect(screen.getByTitle('Move')).toBeInTheDocument()
      expect(screen.getByTitle('Colour')).toBeInTheDocument()
      expect(screen.getByTitle('Lines')).toBeInTheDocument()
      expect(screen.getByTitle('Save as Default')).toBeInTheDocument()
    })

    it('should render drag handle', () => {
      const { container } = render(<ChannelMenu {...defaultProps} />)

      const dragHandle = container.querySelector('.cursor-grab')
      expect(dragHandle).toBeInTheDocument()
    })
  })

  describe('Event handlers', () => {
    it('should call onDelete when delete button clicked', async () => {
      const user = userEvent.setup()
      render(<ChannelMenu {...defaultProps} />)

      const deleteButton = screen.getByTitle('Delete')
      await user.click(deleteButton)

      expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
    })

    it('should call onMove when move button clicked', async () => {
      const user = userEvent.setup()
      render(<ChannelMenu {...defaultProps} />)

      const moveButton = screen.getByTitle('Move')
      await user.click(moveButton)

      expect(defaultProps.onMove).toHaveBeenCalledTimes(1)
    })

    it('should call onToggleColorSubmenu when color button clicked', async () => {
      const user = userEvent.setup()
      render(<ChannelMenu {...defaultProps} />)

      const colorButton = screen.getByTitle('Colour')
      await user.click(colorButton)

      expect(defaultProps.onToggleColorSubmenu).toHaveBeenCalledTimes(1)
    })

    it('should call onToggleLinesSubmenu when lines button clicked', async () => {
      const user = userEvent.setup()
      render(<ChannelMenu {...defaultProps} />)

      const linesButton = screen.getByTitle('Lines')
      await user.click(linesButton)

      expect(defaultProps.onToggleLinesSubmenu).toHaveBeenCalledTimes(1)
    })

    it('should call onSaveAsFavorite when save button clicked', async () => {
      const user = userEvent.setup()
      render(<ChannelMenu {...defaultProps} />)

      const saveButton = screen.getByTitle('Save as Default')
      await user.click(saveButton)

      expect(defaultProps.onSaveAsFavorite).toHaveBeenCalledTimes(1)
    })

    it('should call onDragStart on mouse down', () => {
      const { container } = render(<ChannelMenu {...defaultProps} />)

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
      render(<ChannelMenu {...defaultProps} activeSubmenu="ch-color" />)

      const colorButton = screen.getByTitle('Colour')
      expect(colorButton.closest('button')).toHaveClass('bg-slate-600')
    })

    it('should highlight lines button when lines submenu active', () => {
      render(<ChannelMenu {...defaultProps} activeSubmenu="ch-lines" />)

      const linesButton = screen.getByTitle('Lines')
      expect(linesButton.closest('button')).toHaveClass('bg-slate-600')
    })
  })

  describe('Props validation', () => {
    it('should use default color when not provided', () => {
      const { container } = render(<ChannelMenu {...defaultProps} channelColor={undefined} />)

      expect(container.querySelector('[data-menu="channel"]')).toBeInTheDocument()
    })

    it('should render with custom color', () => {
      render(<ChannelMenu {...defaultProps} channelColor="#ff00ff" />)

      const colorButton = screen.getByTitle('Colour')
      expect(colorButton).toBeInTheDocument()
    })
  })
})
