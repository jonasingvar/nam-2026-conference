import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const nextConfig: NextConfig = { turbopack: { root: import.meta.dirname } };

export default withWorkflow(nextConfig);
