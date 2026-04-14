---
name: performance-review
description: Performance optimization and efficiency analysis
---

# Performance Review Guidelines

When reviewing code for performance issues, check for:

## Performance Analysis

1. **Algorithmic Complexity**
   - Identify O(n²) or worse algorithms that could be optimized
   - Suggest more efficient data structures (Map, Set, etc.)
   - Look for unnecessary nested loops

2. **Database Queries**
   - Detect N+1 query patterns
   - Suggest proper indexing and query optimization
   - Recommend connection pooling when missing

3. **Memory Management**
   - Check for memory leaks (unclosed resources, growing arrays)
   - Identify unnecessary object allocations
   - Look for proper cleanup in error paths

4. **Caching Opportunities**
   - Suggest caching for expensive computations
   - Identify repeated API calls that could be batched
   - Recommend appropriate cache invalidation strategies

5. **Async Patterns**
   - Ensure proper use of async/await
   - Check for parallelizable operations running sequentially
   - Verify error handling in async flows

## Reporting

- Provide before/after code examples for optimizations
- Include complexity analysis (Big O) when relevant
- Suggest specific libraries or patterns for improvement
- Quantify potential performance gains when possible
