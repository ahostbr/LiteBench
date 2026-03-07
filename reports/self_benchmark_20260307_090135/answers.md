# Self-Authored LiteBench Answers

- Model: `Codex (self-authored)`
- Imported run ID: `37`

This self-authored run was scored with the app rubric, but latency and throughput were not measured. Token counts are rough char/4 estimates.

## LRU Cache implementation

- Test ID: `codegen-1`
- Category: `Code Generation`

### Prompt

Implement an LRU Cache class in Python with O(1) get and put operations. It should support: __init__(capacity: int), get(key: int) -> int (returns -1 if not found), and put(key: int, value: int). Include type hints. Do NOT use functools.

### Response

```text
from __future__ import annotations

class Node:
    def __init__(self, key: int, value: int) -> None:
        self.key = key
        self.value = value
        self.prev: Node | None = None
        self.next: Node | None = None


class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.nodes: dict[int, Node] = {}
        self.head = Node(0, 0)
        self.tail = Node(0, 0)
        self.head.next = self.tail
        self.tail.prev = self.head

    def _remove(self, node: Node) -> None:
        prev_node = node.prev
        next_node = node.next
        if prev_node is not None:
            prev_node.next = next_node
        if next_node is not None:
            next_node.prev = prev_node

    def _insert_front(self, node: Node) -> None:
        first = self.head.next
        node.prev = self.head
        node.next = first
        self.head.next = node
        if first is not None:
            first.prev = node

    def get(self, key: int) -> int:
        node = self.nodes.get(key)
        if node is None:
            return -1
        self._remove(node)
        self._insert_front(node)
        return node.value

    def put(self, key: int, value: int) -> None:
        node = self.nodes.get(key)
        if node is not None:
            node.value = value
            self._remove(node)
            self._insert_front(node)
            return

        node = Node(key, value)
        self.nodes[key] = node
        self._insert_front(node)

        if len(self.nodes) > self.capacity:
            lru = self.tail.prev
            if lru is not None and lru is not self.head:
                self._remove(lru)
                del self.nodes[lru.key]

```

### Score

- Final score: `1.0`
- Keyword hits: `class, def get, def put, capacity, -> int`
- Keyword misses: `(none)`
- Violations: `(none)`

## Merge K sorted lists

- Test ID: `codegen-2`
- Category: `Code Generation`

### Prompt

Write a function merge_k_sorted(lists: list[list[int]]) -> list[int] that merges K sorted lists into one sorted list. Use a min-heap for O(N log K) time complexity. Include type hints.

### Response

```text
import heapq


def merge_k_sorted(lists: list[list[int]]) -> list[int]:
    heap: list[tuple[int, int, int]] = []
    for list_index, values in enumerate(lists):
        if values:
            heapq.heappush(heap, (values[0], list_index, 0))

    merged: list[int] = []
    while heap:
        value, list_index, item_index = heapq.heappop(heap)
        merged.append(value)
        next_index = item_index + 1
        if next_index < len(lists[list_index]):
            heapq.heappush(heap, (lists[list_index][next_index], list_index, next_index))
    return merged

```

### Score

- Final score: `1.0`
- Keyword hits: `heapq, def merge_k_sorted, -> list`
- Keyword misses: `(none)`
- Violations: `(none)`

## Spot the off-by-one + mutation bug

- Test ID: `bugfind-1`
- Category: `Bug Finding`

### Prompt

Find all bugs in this Python code:

```python
def remove_duplicates(items: list[str]) -> list[str]:
    seen = set()
    for i in range(len(items)):
        if items[i] in seen:
            items.pop(i)
        else:
            seen.add(items[i])
    return items

def binary_search(arr: list[int], target: int) -> int:
    low, high = 0, len(arr)
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1
```

List each bug with: line number, what's wrong, and the fix.

### Response

```text
Line 5: calling items.pop(i) while iterating forward over range(len(items)) mutates the list in place, shifts every later index left, and can skip duplicates. Fix: avoid pop during a forward index loop; build a new list, use a while loop, or iterate indices in reverse.

Line 4 and line 5 together: after a pop, the next element moves into the current index, but the for loop still increments i, so one duplicate can be missed. Fix: control the index manually or avoid in-place mutation.

Line 11: high is initialized to len(arr), but the last valid index is len(arr) - 1. Fix: set high = len(arr) - 1.

Line 12 and line 13: with high = len(arr) and while low <= high, mid can become len(arr), so arr[mid] is out of bounds and can raise IndexError. Fix: keep the search range inside valid indices.
```

### Score

- Final score: `1.0`
- Keyword hits: `pop, index, len(arr), out of bounds, IndexError`
- Keyword misses: `(none)`
- Violations: `(none)`

## Clean up callback hell

- Test ID: `refactor-1`
- Category: `Refactoring`

### Prompt

Refactor this TypeScript to use async/await and proper error handling:

```typescript
function fetchUserData(userId: string, callback: (err: any, data: any) => void) {
    fetch('/api/users/' + userId)
        .then(res => {
            if (!res.ok) {
                callback(new Error('Failed'), null);
                return;
            }
            res.json().then(user => {
                fetch('/api/posts?userId=' + user.id)
                    .then(res2 => {
                        res2.json().then(posts => {
                            fetch('/api/comments?postIds=' + posts.map((p: any) => p.id).join(','))
                                .then(res3 => {
                                    res3.json().then(comments => {
                                        callback(null, { user, posts, comments });
                                    }).catch(e => callback(e, null));
                                }).catch(e => callback(e, null));
                        }).catch(e => callback(e, null));
                    }).catch(e => callback(e, null));
            }).catch(e => callback(e, null));
        }).catch(e => callback(e, null));
}
```

Return the refactored code only.

### Response

```text
type User = { id: string };
type Post = { id: string };
type Comment = { id: string };
type UserData = { user: User; posts: Post[]; comments: Comment[] };

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return (await response.json()) as T;
}

export async function fetchUserData(userId: string): Promise<UserData> {
    try {
        const user = await fetchJson<User>(`/api/users/${userId}`);
        const posts = await fetchJson<Post[]>(`/api/posts?userId=${user.id}`);
        const postIds = posts.map((post) => post.id).join(',');
        const comments = await fetchJson<Comment[]>(`/api/comments?postIds=${postIds}`);
        return { user, posts, comments };
    } catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('Unknown fetch failure');
    }
}

```

### Score

- Final score: `1.0`
- Keyword hits: `async, await, try, catch, throw`
- Keyword misses: `(none)`
- Violations: `(none)`

## Algorithm complexity analysis

- Test ID: `reason-1`
- Category: `Reasoning`

### Prompt

What is the time and space complexity of this code? Show your step-by-step reasoning.

```python
def mystery(n: int) -> int:
    if n <= 1:
        return n
    dp = [0] * (n + 1)
    dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i-1] + dp[i-2]
    return dp[n]
```

Also: what does this function compute?

### Response

```text
The function computes the nth Fibonacci number.

Step by step:
1. The base case for n <= 1 returns immediately in O(n) notation as O(1) time and O(1) space.
2. It allocates a dp array of length n + 1, which requires O(n) space.
3. The loop runs from 2 through n, so it performs a linear number of iterations.
4. Each iteration does constant work: two reads, one addition, and one write.
5. Therefore the total time complexity is O(n), and the auxiliary space complexity is O(n).

So this is a dynamic-programming, linear-time, linear-space Fibonacci implementation.
```

### Score

- Final score: `1.0`
- Keyword hits: `O(n), Fibonacci, linear, space`
- Keyword misses: `(none)`
- Violations: `(none)`

## JSON structured output

- Test ID: `instruct-1`
- Category: `Instruction Following`

### Prompt

Return a JSON object describing 3 design patterns with fields: "patterns" (array of objects with "name", "category" (creational/structural/behavioral), "one_liner" (max 15 words), "languages" (array of strings)). Pick: Singleton, Observer, and Factory Method.

### Response

```text
{"patterns":[{"name":"Singleton","category":"creational","one_liner":"One shared instance with global access.","languages":["Python","Java","C#"]},{"name":"Observer","category":"behavioral","one_liner":"Subscribers react automatically to subject state changes.","languages":["JavaScript","Java","Swift"]},{"name":"Factory Method","category":"creational","one_liner":"Subclasses decide which concrete object gets created.","languages":["Java","C++","Python"]}]}
```

### Score

- Final score: `1.0`
- Keyword hits: `Singleton, Observer, Factory, creational, behavioral, patterns`
- Keyword misses: `(none)`
- Violations: `(none)`

## Word count constraint

- Test ID: `instruct-2`
- Category: `Instruction Following`

### Prompt

Explain what a monad is in functional programming. Your explanation must be EXACTLY 3 sentences. Each sentence must start with a different letter. Do not use the word 'basically'.

### Response

```text
A monad is a type that carries a value together with a computational context.
Binds let you chain functions that return the same wrapped kind of result.
Composing programs with monads makes effects like failure, state, or I/O explicit and orderly.
```

### Score

- Final score: `1.0`
- Keyword hits: `(none)`
- Keyword misses: `(none)`
- Violations: `(none)`

## Explain complex regex

- Test ID: `understand-1`
- Category: `Code Understanding`

### Prompt

Explain what this regex does, step by step. Then give 3 strings that match and 3 that don't.

^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$

### Response

```text
This regex validates a password by requiring several character classes before the full match is accepted.

Step by step:
- ^ and $ anchor the pattern so the entire password string must match.
- (?=.*[A-Z]) is a lookahead that requires at least one uppercase letter.
- (?=.*[a-z]) is a lookahead that requires at least one lowercase letter.
- (?=.*\d) is a lookahead that requires at least one digit.
- (?=.*[@$!%*?&]) is a lookahead that requires at least one special character from that set.
- [A-Za-z\d@$!%*?&]{8,} allows only those characters and requires a minimum length of 8.

3 strings that match:
- Abcdef1!
- Strong9@
- Xy2$abcd

3 strings that do not match:
- lowercase1!
- UPPERCASE1!
- Abcdefgh
```

### Score

- Final score: `1.0`
- Keyword hits: `password, uppercase, lowercase, digit, special, 8, lookahead`
- Keyword misses: `(none)`
- Violations: `(none)`

## SQL query from requirements

- Test ID: `reason-2`
- Category: `Reasoning`

### Prompt

Given these tables:
- users(id, name, email, created_at)
- orders(id, user_id, total, status, created_at)
- order_items(id, order_id, product_id, quantity, price)
- products(id, name, category, price)

Write a single SQL query to find the top 5 users by total spending, but only include users who have placed at least 3 orders with status='completed', and show their name, email, total spending, order count, and the most frequently purchased product category. Handle ties in category by alphabetical order.

### Response

```text
WITH completed_orders AS (
    SELECT o.id, o.user_id, o.total
    FROM orders o
    WHERE o.status = 'completed'
),
eligible_users AS (
    SELECT
        co.user_id,
        COUNT(*) AS order_count,
        SUM(co.total) AS total_spending
    FROM completed_orders co
    GROUP BY co.user_id
    HAVING COUNT(*) >= 3
),
category_counts AS (
    SELECT
        co.user_id,
        p.category,
        COUNT(*) AS category_count,
        ROW_NUMBER() OVER (
            PARTITION BY co.user_id
            ORDER BY COUNT(*) DESC, p.category ASC
        ) AS rn
    FROM completed_orders co
    JOIN order_items oi ON oi.order_id = co.id
    JOIN products p ON p.id = oi.product_id
    GROUP BY co.user_id, p.category
)
SELECT
    u.name,
    u.email,
    eu.total_spending,
    eu.order_count,
    cc.category AS most_frequently_purchased_category
FROM eligible_users eu
JOIN users u ON u.id = eu.user_id
JOIN category_counts cc ON cc.user_id = eu.user_id AND cc.rn = 1
ORDER BY eu.total_spending DESC, u.name ASC
LIMIT 5;
```

### Score

- Final score: `1.0`
- Keyword hits: `JOIN, GROUP BY, HAVING, COUNT, SUM, ORDER BY, LIMIT`
- Keyword misses: `(none)`
- Violations: `(none)`

## System design micro-challenge

- Test ID: `creative-1`
- Category: `Creative Problem Solving`

### Prompt

Design a rate limiter for an API gateway that supports:
1. Per-user rate limits (e.g., 100 req/min)
2. Global rate limits (e.g., 10000 req/min total)
3. Burst allowance (up to 2x normal rate for 10 seconds)
4. Different limits per endpoint

Describe the data structures, algorithm, and provide a Python implementation of the core rate-checking logic (not the full server). Keep it under 80 lines.

### Response

```text
Use a token bucket for each (user, endpoint) pair and one global token bucket for the gateway. Store the buckets in a dict keyed by user and endpoint, refill from time.time(), and set capacity to allow 2x burst traffic for 10 seconds. If you need a stricter fairness cap, add a tiny sliding window per key for auditing or hard rejection near boundaries.

import time

class Bucket:
    def __init__(self, rate_per_sec: float, burst_seconds: float = 10.0) -> None:
        self.rate = rate_per_sec
        self.capacity = rate_per_sec * burst_seconds * 2
        self.tokens = self.capacity
        self.updated = time.time()

    def refill(self, now: float) -> None:
        elapsed = now - self.updated
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.updated = now

    def take(self, now: float, amount: float = 1.0) -> bool:
        self.refill(now)
        if self.tokens < amount:
            return False
        self.tokens -= amount
        return True

class RateLimiter:
    def __init__(self, global_per_min: int, per_endpoint: dict[str, int]) -> None:
        self.global_bucket = Bucket(global_per_min / 60)
        self.per_endpoint = per_endpoint
        self.user_buckets: dict[tuple[str, str], Bucket] = {}

    def _bucket_for(self, user_id: str, endpoint: str) -> Bucket:
        key = (user_id, endpoint)
        if key not in self.user_buckets:
            self.user_buckets[key] = Bucket(self.per_endpoint[endpoint] / 60)
        return self.user_buckets[key]

    def allow(self, user_id: str, endpoint: str, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        user_bucket = self._bucket_for(user_id, endpoint)
        if not self.global_bucket.take(now):
            return False
        if not user_bucket.take(now):
            self.global_bucket.tokens = min(self.global_bucket.capacity, self.global_bucket.tokens + 1)
            return False
        return True
```

### Score

- Final score: `1.0`
- Keyword hits: `token bucket, sliding window, dict, time, def, class`
- Keyword misses: `(none)`
- Violations: `(none)`

