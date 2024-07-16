async function* mapStream<T, U>(
  iter: AsyncIterable<T>,
  fn: (t: T) => U | Promise<U>
) {
  for await (const value of iter) {
    yield await fn(value);
  }
}

export default mapStream;
