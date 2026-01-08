# Testing Guide

## Overview
This project uses Vitest for unit and integration testing with React Testing Library for component testing.

## Test Structure
```
client/src/__tests__/
├─ hooks/           # Hook unit tests
├─ components/      # Component unit tests
├─ lib/             # Utility function tests
├─ integration/     # Integration workflow tests
├─ setup.ts         # Global test setup
└─ utils/
   └─ testHelpers.ts # Shared test utilities
```

## Running Tests

### Development
```bash
npm test            # Watch mode (re-run on file changes)
```

### CI/CD
```bash
npm run test:run    # Single run (for pipelines)
```

### Coverage
```bash
npm run test:coverage  # Generate coverage report
```

### Visual UI
```bash
npm run test:ui     # Open Vitest UI (visual debugging)
```

## Writing Tests

### Hook Test Example
```typescript
import { renderHook, act } from '@testing-library/react';
import { useDrawingState } from '@/hooks/useDrawingState';

describe('useDrawingState', () => {
  it('should add a drawing', () => {
    const { result } = renderHook(() => useDrawingState());
    
    act(() => {
      result.current.addDrawing('trendline', { id: '1', ... });
    });
    
    expect(result.current.state.trendlines).toHaveLength(1);
  });
});
```

### Component Test Example
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrendlineMenu } from '@/components/menus/TrendlineMenu';

describe('TrendlineMenu', () => {
  it('should call onDelete when delete clicked', async () => {
    const onDelete = vi.fn();
    render(<TrendlineMenu onDelete={onDelete} />);
    
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);
    
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Test Example
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Drawing Workflow', () => {
  it('should complete a full drawing cycle', async () => {
    const { result } = renderHook(() => useDrawingState());
    
    // Add drawing
    act(() => {
      result.current.addDrawing('trendline', mockData);
    });
    
    // Update drawing
    act(() => {
      result.current.updateDrawing('1', updatedData);
    });
    
    // Delete drawing
    act(() => {
      result.current.deleteDrawing('1');
    });
    
    expect(result.current.state.trendlines).toHaveLength(0);
  });
});
```

## Test Coverage Goals

### Current Coverage (Phase 3B)
- **Overall:** 70%+ (143 tests)
- **Hooks:** 90%+
- **Components:** 85%+
- **Utilities:** 95%+
- **Integration:** 70%+

### Coverage Thresholds
Configured in `vitest.config.ts`:
```typescript
coverage: {
  thresholds: {
    lines: 70,
    functions: 70,
    branches: 70,
    statements: 70,
  }
}
```

## Best Practices

### General
1. **Arrange-Act-Assert:** Structure tests clearly
2. **One assertion per test:** Keep tests focused
3. **Descriptive names:** Use clear, descriptive test names
4. **Clean up:** Ensure tests clean up after themselves

### React Testing
1. **User-centric:** Test from user perspective
2. **Accessible queries:** Use `getByRole`, `getByLabelText`
3. **Avoid implementation details:** Don't test internal state
4. **Async properly:** Use `waitFor`, `findBy` for async operations

### Hooks Testing
1. **Use renderHook:** From `@testing-library/react`
2. **Wrap in act:** For state updates
3. **Test edge cases:** Null values, empty arrays, etc.
4. **Test cleanup:** Verify resources are cleaned up

### Integration Testing
1. **Test workflows:** Complete user flows
2. **Minimal mocking:** Use real components when possible
3. **Test boundaries:** Error states, edge cases
4. **Verify side effects:** API calls, state changes

## Common Patterns

### Testing with Context
```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}
```

### Testing Async Operations
```typescript
it('should load data', async () => {
  render(<Component />);
  
  // Wait for loading to finish
  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
  
  // Check data is displayed
  expect(screen.getByText(/data/i)).toBeInTheDocument();
});
```

### Testing User Events
```typescript
it('should handle click', async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick} />);
  
  const button = screen.getByRole('button');
  await userEvent.click(button);
  
  expect(onClick).toHaveBeenCalled();
});
```

## Debugging Tests

### Console Output
```bash
npm test -- --reporter=verbose
```

### Visual UI
```bash
npm run test:ui
# Opens browser with test visualization
```

### Watch Single File
```bash
npm test -- path/to/file.test.ts
```

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test"],
  "console": "integratedTerminal"
}
```

## CI/CD Integration

### GitHub Actions
Tests run automatically on:
- Every push to `main` or `develop`
- Every pull request
- Multiple Node versions (18.x, 20.x)

### Coverage Reporting
- Coverage uploaded to Codecov
- PR comments with coverage changes
- Minimum 70% coverage required

## Troubleshooting

### Tests Timing Out
- Increase timeout in test: `it('test', { timeout: 10000 }, () => {})`
- Or globally in `vitest.config.ts`: `testTimeout: 10000`

### Module Import Errors
- Check path aliases in `vitest.config.ts`
- Verify imports match file structure
- Clear cache: `rm -rf node_modules/.vite`

### Flaky Tests
- Avoid `setTimeout` - use `waitFor` instead
- Ensure proper cleanup
- Check for race conditions
- Use `act` for state updates

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Common Testing Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
