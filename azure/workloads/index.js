// A simple function returning the factorial of a set number n
const factorial = (n) => {
  let res = 1;

  for (let i = 2; i <= n; i += 1) {
    res *= i;
  }
  return res;
};

exports.factorial = async () => {
  const n = 20;
  return {
    status: 200,
    headers: {
      'content-type': 'text/plain',
    },
    body: `${n}! = ${factorial(n)}`,
  };
};
