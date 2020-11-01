type float = number;//f64;
type int = number;//i32;
let max = Math.max;

type Vec = Array<float>;
const splitter = 134217729.; // = 2^27+1 for 64-bit float
let EE: float; // global variable for storing temp error

/* === Basic EFT bricks === */

// 2do: inline in all places (works if |a| > |b|)
function quickSum(a: float, b: float): float {
  let s = a + b;
  EE = b - (s - a);
  return s;
}

// Algorithm 3.1 from [2]
function twoSum(a: float, b: float): float {
  let s = a + b;
  let t  = s - b;
  EE = (a - t) + (b - (s - t));
  return s;
}

// Algorithm 3.3 with inlined 3.2 from [2]
function twoProd(a: float, b: float): float {
  let t = splitter * a;
  let ah = t + (a - t), al = a - ah;
  t = splitter * b;
  let bh = t + (b - t), bl = b - bh;
  t = a * b;
  EE = al * bl - (((t - ah * bh) - ah * bl) - al * bh);
  return t;
}

/* === Vectorized helpers === */

// Merge two descending sorted arrays of floats into one sorted array
function vecMerge(A: Vec, Al: int, Ar: int, B: Vec, Bl: int, Br: int): Vec {
  let len = Ar - Al + Br - Bl;
  let R = new Array<float>(len);
  let i = Al, j = Bl, k = 0;
  while (k < len) {
    if (i < Ar && j < Br) {
      R[k++] = (Math.abs(A[i]) > Math.abs(B[j])) ? A[i++] : B[j++];
    } else {
      R[k++] = (i < Ar) ? A[i++] : B[j++];
    }
  }
  return R;
}

// Merge and negate B
function vecMergeNeg(A: Vec, Al: int, Ar: int, B: Vec, Bl: int, Br: int): Vec {
  let len = Ar - Al + Br - Bl;
  let R = new Array<float>(len);
  let i = Al, j = Bl, k = 0;
  while (k < len) {
    if (i < Ar   && j < Br) {
      R[k++] = (Math.abs(A[i]) > Math.abs(B[j])) ? A[i++] : -B[j++];
    } else {
      R[k++] = (i < Ar) ? A[i++] : -B[j++];
    }
  }
  return R;
}

// Algorithm 3
function vecSum(A: Vec): Vec {
  let E = new Array<float>(A.length);
  let s = A[A.length - 1];
  for (let i = A.length - 2; i >= 0; i--) {
    s = quickSum(A[i], s);
    E[i + 1] = EE;
  }
  E[0] = s;
  return E;
}

// Algorithm 7
function vecSumErrBranch(E: Vec, outSize: int): Vec {
  let F = new Array<float>(E.length);
  let e = E[0], j = 0;
  for (let i = 0; i <= E.length - 2; i++) {
    F[j] = quickSum(e, E[i + 1]);
    e = EE;
    if (e != 0.) {
      if (j++ >= outSize - 1) return F;
    } else {
      e = F[j];
    }
  }
  if (e != 0. && j < outSize) F[j++] = e;
  for (let i = j; i < outSize; i++) F[i] = 0;
  return F;
}

// Algorithm 8
// 2do: inline
function vecSumErr(F: Vec, begin: int, end: int): Vec {
  let p = F[begin];
  for (let i = begin; i < end - 1; i++) {
    F[i] = quickSum(p, F[i + 1]);
    p = EE;
  }
  F[end - 1] = p;
  return F;
}

// Algorithm 6
function renormalize(A: Vec, outSize: int): Vec {
  let F = vecSumErrBranch(vecSum(A), outSize + 1);//why?
  for (let i = 0; i < outSize; i++) {
    F = vecSumErr(F, i, outSize);
  }
  return F.slice(0, outSize);//why?
}

/* === Arbitrary-precision operations === */

// Algorithm 4
export function add(A: Vec, B: Vec): Vec {
  let n = max(A.length, B.length);
  return renormalize(vecMerge(A, 0, A.length, B, 0, B.length), n);
}

// Negated Algorithm 4
export function sub(A: Vec, B: Vec): Vec {
  let n = max(A.length, B.length);
  return renormalize(vecMergeNeg(A, 0, A.length, B, 0, B.length), n);
}

// Algorithm 5
// 2do: revisit memory consum
export function mul(A: Vec, B: Vec): Vec {
  let n = A.length, m = B.length, d = max(n, m);
  let R = new Array<float>(d);
  let P = new Array<float>(d);
  let E = new Array<float>(d * d);
  let E2 = new Array<float>(d);
  let S: Array<float>;
  for (let i = n; i < d; i++) A[i] = 0;
  for (let i = m; i < d; i++) B[i] = 0;
  R[0] = twoProd(A[0], B[0]);
  E[0] = EE;
  R[d] = 0;
  for (let n = 1; n < d; n++) {
    for (let i = 0; i <= n; i++) {
      P[i] = twoProd(A[i], B[n - i]);
      E2[i] = EE;
    }
    S = vecSum(vecMerge(P, 0, n + 1, E, 0, n * n));//opt:vecMerge?
    R[n] = S[0];
    E = vecMerge(S, 1, n * n + n + 1, E2, 0, n + 1);
  }
  for (let i = 1; i < d; i++) R[d] += A[i] * B[d - i];
  for (let i = 0; i < d * d; i++) R[d] += E[i];
  return renormalize(R, d);
}

// Algorithm 10
export function div(A: Vec, B: Vec): Vec {
  let n = A.length, m = B.length, d = max(n, m);
  let F: Array<float>;
  let R = new Array<float>(d);
  let Q = new Array<float>(d);
  for (let i = 0; i < n; i++) R[i] = A[i];
  for (let i = n; i < d; i++) R[i] = 0;
  for (let i = m; i < d; i++) B[i] = 0;
  Q[0] = A[0] / B[0];
  for (let i = 1; i < d; i++) {
    F = mul([Q[i - 1]], B);
    R = renormalize(sub(R, F), d);
    Q[i] = R[0] / B[0];
  }
  return renormalize(Q, d);
}

//export function sqrt(A: Array<float>): Array<float> {  }