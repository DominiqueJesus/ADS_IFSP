

ALINHAMENTO BINÁRIO:

Não podemos começar a rede em qualquer lugar/endereço. Os bits precisam estar alinhados, conforme as seguinte regras:



Para não errar nunca:

1\. Veja quantos IPs totais a máscara tem (ex: /26 tem 64 IPs).

2\. Se for menor que 256, o quarto octeto tem que ser múltiplo desse número.

3\. Se for maior que 256, calcule os saltos. O terceiro octeto terá que ser múltiplo desse resultado, e o quarto octeto zera (no endereço de rede, termina com .0).



Como calcular saltos:

Opção 1: Dividir total de IPs por 256 (ex: 1024 IPs / 256 = salto de 4)

Opção 2: Subtrair o decimal que representa os bits emprestados de 256. Encontramos ele na máscara de rede (ex: máscara é 255.255.252.0 -> 256-252= 4 saltos).


As sub-redes precisam ser blocos contínuos:


* Não podemos dividir a sub-rede em pedaços separados (entre outras sub-redes). A sub-rede inteira fica em um mesmo bloco (em sequência, podemos ter outra sub-rede ou um bloco livre).
* Por isso, não podemos dividir os endereços disponíveis só com uma conta de divisão decimal simples. Precisamos ver o tamanho de cada sub-rede, o alinhamento binário dela e colocá-la em um espaço adequado, distribuindo para caber todas.



'''

A e B NÃO MUDAM -> 1024 - 128 (63; 61 usados + broadcast + rede) - 64 (48; 46 usados + broadcast + rede) =

SOBRAM 832 endereços para as outras sub-redes ------> ESSE CÁLCULO É CORRETO, MAS NÃO LEVA EM CONTA A SOBREPOSIÇÃO (OS BLOCOS DE REDE PRECISAM SER CONTÍNUOS)



E: Usa pelo menos 400 (menor bloco: 512)

'''







EXERCÍCIO


172.30.8.0/22



máscara: 255.255.252.0

bits emprestados: 6

saltos: 256-252 = 4

sub-redes: 2^6 = 64

endereços: 2^16 / 2^6 = 2^10 (1024)

end. válidos: 1024 - 2 = 1022



Primeiro: 172.30.8.0

Último: 172.30.11.255



A: 172.30.8.0/25 -> 60 + 1 hosts



máscara: 255.255.255.128

bits emprestados: 9

saltos: 256-128 = 128

sub-redes: 2^9 = 512

endereços: 2^16 / 2^9 = 2^7 (128)

end. válidos: 128 - 2 = 126



Primeiro: 172.30.8.0 (utilizável .1)

Último: 172.30.8.127 (utilizável .126)



DISPONÍVEL: 172.30.8.128 a 172.30.8.255 (128 endereços) -> Posso mover C para cá



''' REALOCADO '''

C: 172.30.8.128/25 -> 90 + 1 hosts



máscara: 255.255.255.128

bits emprestados: 9

saltos: 256-128 = 128

sub-redes: 2^9 = 512

endereços: 2^16 / 2^9 = 2^7 (128)

end. válidos: 128 - 2 = 126



Primeiro: 172.30.8.128 (utilizável .129) 

Último: 172.30.8.255 (utilizável .254)

'''



B: 172.30.9.0/26 -> 45 + 1 hosts



máscara: 255.255.255.192

bits emprestados: 10

saltos: 256-192 = 64

sub-redes: 2^10 = 1024

endereços: 2^16 / 2^10 = 2^6 (64)

end. válidos: 64 - 2 = 62



Primeiro: 172.30.9.0 (utilizável .1)

Último: 172.30.9.63 (utilizável .62)



DISPONÍVEL: 172.30.9.64 a *172.30.9.255* (192 endereços) - NOVO (Sem C): 172.30.9.64 a 172.30.11.255 (704 endereços)



D: 172.30.9.64/26 -> 40 + 1 hosts



máscara: 255.255.255.192

bits emprestados: 10

saltos: 256-192 = 64

sub-redes: 2^10 = 1024

endereços: 2^16 / 2^10 = 2^6 (64)

end. válidos: 64 - 2 = 62



Primeiro: 172.30.11.0 (utilizável .1) --> NOVO: 172.30.9.64 (utilizável .65)

Último: 172.30.11.63 (utilizável .62) --> NOVO: 172.30.9.127 (utilizável .126)	



DISPONÍVEL: 172.30.9.128 a *172.30.9.255 (128 endereços) - ÚNICO DISPONIVEL NO FIM*



E: 172.30.10.0/23 -> 400 + 1 hosts 



máscara: 255.255.254.0

bits emprestados: 7

saltos: 256-254 = 2

sub-redes: 2^7 = 128

endereços: 2^16 / 2^7 = 2^9 (512)

end. válidos: 512 - 2 = 510



Primeiro: 172.30.10.0 (utilizável .1)

Último: 172.30.11.255 (utilizável .254)



