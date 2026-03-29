import { render, screen } from '@testing-library/react';\ndescribe('test', () => { it('works', () => { render(<div />); screen.getByText('hi'); }); });
