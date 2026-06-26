"""
backend/utils/landmark_utils.py
---------------------------------
Shared helpers for landmark preprocessing used by both
the predictor and the WebSocket handler.
"""

import numpy as np


def flatten_landmarks(landmarks_list: list[dict]) -> np.ndarray:
    """
    Convert a list of {'x':float, 'y':float, 'z':float} dicts
    (as returned by MediaPipe JSON) into a flat (63,) numpy array.
    """
    flat = []
    for lm in landmarks_list:
        flat.extend([lm.get("x", 0), lm.get("y", 0), lm.get("z", 0)])
    return np.array(flat, dtype=np.float32)


def normalize_landmarks(lm_array: np.ndarray) -> np.ndarray:
    """
    lm_array: (21, 3)
    Returns wrist-relative, scale-normalized (21, 3) array.
    """
    wrist = lm_array[0].copy()
    norm  = lm_array - wrist
    scale = np.max(np.linalg.norm(norm, axis=1)) + 1e-6
    return norm / scale


def landmarks_to_feature_vector(lm_array: np.ndarray) -> np.ndarray:
    """Full pipeline: (21,3) raw → (63,) normalized feature vector."""
    return normalize_landmarks(lm_array).flatten()


def validate_landmark_count(data: list, expected: int = 63) -> bool:
    return isinstance(data, list) and len(data) == expected


def compute_finger_angles(lm: np.ndarray) -> np.ndarray:
    """
    Compute bend angles for each finger (4 fingers × 1 angle = 4 values).
    Useful as additional features for more complex classifiers.
    lm: normalized (21, 3)
    """
    finger_joints = [
        [5, 6, 7, 8],    # Index
        [9, 10, 11, 12],  # Middle
        [13, 14, 15, 16], # Ring
        [17, 18, 19, 20], # Pinky
    ]
    angles = []
    for joints in finger_joints:
        mcp, pip, dip, tip = [lm[j] for j in joints]
        # Angle at PIP joint
        v1 = pip - mcp
        v2 = dip - pip
        cos_a = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
        angles.append(float(np.arccos(np.clip(cos_a, -1, 1))))
    return np.array(angles)
