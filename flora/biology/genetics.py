import numpy as np
from typing import List, Tuple
from dataclasses import dataclass

@dataclass
class Genome:
    """A generic polyploid genome holding homologous chromosomes."""
    strands: List[List[int]]  # list of chromosomes, each is a list of alleles

    @property
    def ploidy(self) -> int:
        return len(self.strands)

def perform_meiosis(parent: Genome, rng: np.random.Generator, 
                    crossover_rate=0.2, 
                    unequal_crossover_rate=0.05, 
                    nondisjunction_rate=0.02) -> List[List[int]]:
    """
    Simulates rigorous meiosis including:
    - Homolog segregation (reductional division)
    - Crossing over (recombination)
    - Unequal crossing over (deletions / duplications)
    - Non-disjunction (aneuploidy)
    
    Returns a haploid/gametic set of strands.
    """
    strands = [s[:] for s in parent.strands]
    ploidy = parent.ploidy
    
    if ploidy < 2:
        # Haploid meiosis just clones with rare mutations (not implemented here)
        return [strands[0][:]]
    
    # 1. Pairing and Crossing Over
    # We pair random homologs to cross over.
    for i in range(ploidy - 1):
        if rng.random() < crossover_rate:
            s1, s2 = strands[i], strands[i+1]
            min_len = min(len(s1), len(s2))
            if min_len > 1:
                idx = rng.integers(1, min_len)
                
                # Unequal crossing over
                if rng.random() < unequal_crossover_rate:
                    shift = rng.integers(1, 3)
                    if rng.random() < 0.5 and idx + shift < len(s1):
                        # s1 loses, s2 gains
                        tail1 = s1[idx+shift:]
                        tail2 = s2[idx:]
                        strands[i] = s1[:idx+shift] + tail2
                        strands[i+1] = s2[:idx] + tail1
                    elif idx + shift < len(s2):
                        tail1 = s1[idx:]
                        tail2 = s2[idx+shift:]
                        strands[i] = s1[:idx] + tail2
                        strands[i+1] = s2[:idx+shift] + tail1
                else:
                    # Equal crossover
                    tail1, tail2 = s1[idx:], s2[idx:]
                    strands[i] = s1[:idx] + tail2
                    strands[i+1] = s2[:idx] + tail1
                    
    # 2. Segregation (Anaphase)
    # Normal reduction separates ploidy into ploidy//2.
    # Triploids (3) normally yield n and 2n gametes.
    target_gamete_n = ploidy // 2 if ploidy % 2 == 0 else (ploidy // 2 + (1 if rng.random() < 0.5 else 0))
    target_gamete_n = max(1, target_gamete_n)
    
    # Non-disjunction: homologous chromosomes fail to separate
    if rng.random() < nondisjunction_rate:
        target_gamete_n += rng.choice([-1, 1])
        target_gamete_n = max(1, min(ploidy, target_gamete_n))
        
    rng.shuffle(strands)
    return strands[:target_gamete_n]

def breed(g1: Genome, g2: Genome, seed: int = None) -> Genome:
    """Crosses two genomes by performing meiosis on both and fusing the gametes."""
    rng = np.random.default_rng(seed)
    gamete1 = perform_meiosis(g1, rng)
    gamete2 = perform_meiosis(g2, rng)
    return Genome(strands=gamete1 + gamete2)

def extract_phenotype_pool(genome: Genome) -> dict:
    """
    Extracts the allele pool for each locus across all strands.
    Missing alleles (due to deletions) are just omitted.
    Multiple alleles at the same locus (duplications) are all added.
    """
    # Assuming alleles are structurally mapped by their index in the string.
    # We transpose the strands.
    max_len = max((len(s) for s in genome.strands), default=0)
    pool = {locus: [] for locus in range(max_len)}
    
    for s in genome.strands:
        for locus, allele in enumerate(s):
            pool[locus].append(allele)
            
    # Sort alleles so dominant/recessive can be determined deterministically
    for locus in pool:
        pool[locus].sort()
        if not pool[locus]:
            pool[locus] = [0] # Null allele if deleted
            
    return pool

