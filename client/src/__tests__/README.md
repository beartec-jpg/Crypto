# Testing Infrastructure - Phase 3B

This directory contains the comprehensive test suite for the Crypto application, built using Vitest and React Testing Library.

## 🎯 Test Coverage

**Current Status: 143 tests passing**

- ✅ Hook Unit Tests: 45 tests
- ✅ Component Unit Tests: 68 tests
- ✅ Utility Tests: 22 tests  
- ✅ Integration Tests: 18 tests

## 📁 Structure

```
client/src/__tests__/
├── setup.ts                    # Global test configuration
├── utils/
│   └── testHelpers.tsx         # Shared test utilities
├── hooks/                      # Hook unit tests
│   ├── useDrawingState.test.ts
│   ├── useChartScales.test.ts
│   └── useErrorHandler.test.ts
├── components/                 # Component unit tests
│   ├── ErrorBoundary.test.tsx
│   ├── LoadingSpinner.test.tsx
│   └── menus/
│       ├── TrendlineMenu.test.tsx
│       ├── HorizontalMenu.test.tsx
│       └── ChannelMenu.test.tsx
├── lib/                        # Utility tests
│   └── errorHandler.test.ts
└── integration/                # Integration tests
    ├── DrawingWorkflow.test.tsx
    └── ErrorRecovery.test.tsx
```

## 🛠️ Test Scripts

```bash
# Run all tests once
npm run test:run

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage

# Run tests (continuous)
npm test
```

## 📝 Test Utilities

### `renderWithProviders()`
Renders components with necessary providers (QueryClient, etc.)

### `createMockCandles(count)`
Generates mock candle data for chart testing

### `createMockTrendline(overrides?)`
Creates mock trendline data

### `createMockHorizontal(overrides?)`
Creates mock horizontal line data

### `createMockChannel(overrides?)`
Creates mock channel data

## ✅ Hook Tests

### `useDrawingState.test.ts`
Tests for drawing state management hook:
- Drawing CRUD operations
- Undo/redo functionality
- History management
- State consistency
- Selection state

### `useChartScales.test.ts`
Tests for D3 scale management:
- Scale initialization
- Memoization efficiency
- Coordinate conversions
- D3 loader integration
- Responsive scaling

### `useErrorHandler.test.ts`
Tests for error handling hook:
- Error state management
- Error logging
- Log export
- Memory management

## 🧩 Component Tests

### Menu Components
- **TrendlineMenu**: Tests menu rendering, event handlers, active states
- **HorizontalMenu**: Tests menu UI and interactions
- **ChannelMenu**: Tests channel menu functionality

### Core Components
- **ErrorBoundary**: Tests error catching, fallback UI, recovery
- **LoadingSpinner**: Tests rendering, accessibility, size variants

## 🔧 Utility Tests

### `errorHandler.test.ts`
Tests for ErrorHandler utility class:
- Error/warning/info logging
- Log rotation (100 max)
- JSON export
- Console output

## 🔄 Integration Tests

### `DrawingWorkflow.test.tsx`
Tests complete drawing workflows:
- Creation → Modification → Deletion cycles
- Undo/redo in context
- Multiple drawing types
- Selection workflows
- State persistence

### `ErrorRecovery.test.tsx`
Tests error handling and recovery:
- Error boundary integration
- Error logging workflows
- Graceful degradation
- Recovery actions

## 🎨 Testing Best Practices

1. **Isolation**: Each test is independent
2. **Arrange-Act-Assert**: Clear test structure
3. **User-Centric**: Test user workflows, not implementation
4. **Mocking**: Mock external dependencies (D3, APIs)
5. **Accessibility**: Verify ARIA attributes and roles

## 🚀 Adding New Tests

1. **Create test file** in appropriate directory
2. **Import utilities** from `testHelpers.tsx`
3. **Follow naming convention**: `ComponentName.test.tsx`
4. **Write descriptive tests**: Focus on behavior
5. **Run tests** to verify they pass

## 📊 Coverage Goals

- Overall: 70%+
- Hooks: 90%+
- Components: 85%+
- Utilities: 95%+
- Integration: 70%+

## 🔍 Debugging Tests

```bash
# Run specific test file
npx vitest run useDrawingState.test.ts

# Run tests matching pattern
npx vitest run -t "should add new drawing"

# Debug with UI
npm run test:ui
```

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**Last Updated**: January 2026  
**Total Tests**: 143  
**Status**: ✅ All Passing
