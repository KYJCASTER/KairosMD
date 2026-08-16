# 代码高亮

KairosMd 使用 [Shiki](https://shiki.style) 进行代码高亮，内置了常用语言，遇到未加载的语言会自动按需补载。

## 行内代码

用 `npm run dev` 启动开发服务器，配置文件在 `wails.json`。

## 代码块

```javascript
// 一个简单的防抖函数
function debounce(fn, delay = 300) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}
```

```go
package main

import "fmt"

// Fibonacci 返回第 n 个斐波那契数
func Fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    a, b := 0, 1
    for i := 2; i <= n; i++ {
        a, b = b, a+b
    }
    return b
}

func main() {
    fmt.Println(Fibonacci(10)) // 55
}
```

```python
def quicksort(arr):
    """快速排序"""
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)
```

```bash
# 构建生产版本
wails build
# 输出在 build/bin/KairosMd.exe
```

```sql
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id
ORDER BY order_count DESC;
```

## Diff

```diff
- 旧的实现方式
+ 新的改进版本
  上下文行不变
```

## 未内置的语言

下面是 Kotlin 代码，Shiki 会在首次遇到时动态加载语言包：

```kotlin
data class User(val name: String, val age: Int)

fun main() {
    val users = listOf(User("Alice", 30), User("Bob", 25))
    users.filter { it.age > 26 }.forEach { println(it.name) }
}
```
